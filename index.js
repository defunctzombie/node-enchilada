var path = require('path');
var fs = require('fs');
var url = require('url');
var crypto = require('crypto');
var convert = require('convert-source-map');
var EventEmitter = require('events').EventEmitter;

var mime = require('mime');
var uglifyjs = require('uglify-js');
var browserify = require('browserify');
var debug = require('debug')('enchilada');

var filewatcher = require('filewatcher');

uglifyjs.AST_Node.warn_function = function(msg) {
    debug('warn: %s', msg);
};

module.exports = function enchilada(opt) {

    // if just a path is passed in, treat as public file dir
    if (typeof opt === 'string') {
        opt = { src: opt };
    }

    var pubdir = opt.src;
    var routes = opt.routes || {};
    var bundles = {};

    var compress = false || opt.compress;
    var cache = {}; // cache of sourcefiles
    var generating = {};
    var maps = {}; // cache of sourcemaps
    var debug_opt = false || opt.debug;

    var watch = !opt.cache;
    var watchCallback = opt.watchCallback;

    var emitter = new EventEmitter;

    function makeBundle(options) {
        var bundle = browserify(options);
        if (opt.transforms) {
            opt.transforms.forEach(function(transform) {
                bundle.transform(transform)
            });
        }
        if (opt.globalTransforms) {
            opt.globalTransforms.forEach(function(transform) {
                bundle.transform({ global: true }, transform)
            });
        }
        if (opt.externals) {
            opt.externals.forEach(function(external) {
                bundle.external(external);
            });
        }
        return bundle;
    }

    // TODO(shtylman) externs that use other externs?
    Object.keys(routes).map(function(id) {
        var name = routes[id];

        debug('route: %s -> %s', id, name);

        var bundle = makeBundle({ exposeAll: true });
        bundle.require(name, { entry: true, expose: name, basedir: pubdir });
        return bundles[id] = bundle;
    });

    return function(req, res, next) {
        var req_path = req.path || url.parse(req.url).path;

        if (/.map.json$/.test(req_path) && maps[req_path]) {
            return res.json(maps[req_path]);
        }

        // if no extension, then don't process
        // handles case of directories and other random urls
        if (!path.extname(req_path)) {
            return notFound();
        }
        else if (mime.lookup(req_path) !== 'application/javascript') {
            return notFound();
        }

        // check cache
        var cached = cache[req_path];
        if (cached) {
            return sendResponse(null, cached);
        }

        // check for bundle
        var bundle = bundles[req_path];
        if (bundle) {
            return safeGenerate(bundle, sendResponse);
        }

        var local_file = path.normalize(path.join(pubdir, req_path));

        // check for malicious attempts to access outside of pubdir
        if (local_file.indexOf(pubdir) !== 0) {
            return notFound();
        }

        // lookup in filesystem
        fs.exists(local_file, function(exists) {
            if (!exists) {
                return notFound();
            }

            var bundle = makeBundle(local_file);
            Object.keys(bundles).forEach(function(id) {
                bundle.external(bundles[id]);
            });
            safeGenerate(bundle, sendResponse);
        });

        // safeGenerate joins multiple simultaneous generates per req_path
        function safeGenerate(bundle, callback) {
            emitter.once(req_path, callback);
            if (!generating[req_path]) {
                generating[req_path] = true;
                debug('bundling %s', local_file);
                generate(bundle, function(error, src) {
                    delete generating[req_path];
                    if (error) {
                        debug("error building %s from %s: %s", req_path, local_file, error)
                    } else {
                        debug("built %s from %s", req_path, local_file)
                    }
                    emitter.emit(req_path, error, src);
                });
            }
        }
        function generate(bundle, callback) {
            var dependencies = {};

            // typically SyntaxError
            var otherError;
            bundle.once('error', function(err) { otherError = err; });

            var collect_deps = function(file) {
                dependencies[file] = true;
            };

            if (watch) {
                bundle.on('file', collect_deps);
            }

            bundle.bundle({ debug: debug_opt }, function(err, src) {
                bundle.removeListener('file', collect_deps);

                if (watch) {
                    watchFiles(bundle, dependencies, req_path);
                }
                if (err) {
                    return callback(err);
                }
                if (otherError) {
                    return callback(otherError);
                }

                var srcmap = undefined;
                var map_path = undefined;
                if (debug_opt) {
                    // output sourcemap
                    srcmap = convert.fromComment(src);
                    src = convert.removeComments(src);
                    srcmap.setProperty('file', req_path);
                    map_path = req_path.replace(/.js$/, '.map.json');
                }

                if (compress) {
                    var ugly_opt = {
                        fromString: true
                    };

                    if (srcmap) {
                        ugly_opt.inSourceMap = srcmap.toObject(),
                        ugly_opt.outSourceMap = req_path
                    }

                    var result = uglifyjs.minify(src, ugly_opt);

                    src = result.code;

                    if (srcmap) {
                        // prepare new sourcemap
                        // we need to get the sources from bundled sources
                        // uglify does not carry those through
                        var srcs = srcmap.getProperty('sourcesContent');
                        srcmap = convert.fromJSON(result.map);
                        srcmap.setProperty('sourcesContent', srcs);
                    }
                }

                if (srcmap) {
                    src += '//# sourceMappingURL=' + path.basename(map_path);
                    maps[map_path] = srcmap.toObject();
                }

                cache[req_path] = src;

                callback(null, src);
            });
        }

        function notFound() {
            if (typeof next === 'function') {
                return next();
            }

            res.setHeader('Content-Type', 'text/plain');
            respond(404, 'Not Found');
        }

        function sendResponse(err, src) {
            if (err) {
                return sendError(err);
            }

            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('ETag', crypto.createHash('md5').update(src).digest('hex').slice(0, 6));
            res.setHeader('Vary', 'Accept-Encoding');
            respond(200, src);
        }

        function sendError(err) {
            if (typeof next === 'function') {
                return next(err);
            }

            res.setHeader('Content-Type', 'text/plain');
            respond(500, err.toString());
        }

        function respond(code, data) {
            data = new Buffer(data);
            res.setHeader('Content-Length', data.length);
            res.writeHeader(code);
            res.end(data);
        }

        function watchFiles(bundle, dependencies, path) {
            // close any current watchers to avoid double watching
            // this happens when we are already bundling (not yet done)
            // and a file change (or request) triggers a new build
            // leading to generate being called again (which will add watchers)
            // but our first build will also add watchers since nothing will stop it
            // here we remove any watchers first
            var watcher = filewatcher();
            watcher.once('change', function(file) {
                debug("rebuilding %s due to change in %s", req_path, file);
                watcher.removeAll();
                delete cache[path];
                safeGenerate(bundle, function(error) {
                    if (watchCallback) {
                        watchCallback(error, path);
                    }
                });
            });
            watcher.once('fallback', function(limit) {
                debug('Ran out of file handles after watching %s files.', limit);
                debug('Falling back to polling which uses more CPU.');
                debug('Run ulimit -n 10000 to increase the limit for open files.');
            });
            Object.keys(dependencies).map(function(filename) {
                watcher.add(filename);
            });
        }
    };
};

