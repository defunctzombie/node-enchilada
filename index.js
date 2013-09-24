// builtin
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

// vendor
var mime = require('mime');
var uglifyjs = require('uglify-js');
var browserify = require('browserify');
var through = require('through');

var watcher = require('./watcher')

module.exports = function enchilada(opt) {

    // if just a path is passed in, treat as public file dir
    if (typeof opt === 'string') {
        opt = { src: opt };
    }

    var pubdir = opt.src;
    var routes = opt.routes || {};
    var bundles = {};

    var compress = false || opt.compress;
    var cache = {};
    var debug = false || opt.debug;

    var watch = !opt.cache;
    var watchCallback = opt.watchCallback;

    function addTransforms(bundle) {
        if (opt.transforms) {
            opt.transforms.forEach(bundle.transform.bind(bundle));
        }
    }

    // TODO(shtylman) externs that use other externs?
    var externs = Object.keys(routes).map(function(id) {
        var name = routes[id];

        var opt = {
            // don't bundle require code with externs
            client: false
        };

        var bundle = browserify({ exposeAll: true });
        addTransforms(bundle);
        bundle.require(name, { expose: name, basedir: pubdir });
        return bundles[id] = bundle;
    });

    return function(req, res, next) {
        var req_path = req.path;

        // if no extension, then don't process
        // handles case of directories and other random urls
        if (!path.extname(req_path)) {
            return next();
        }
        else if (mime.lookup(req_path) !== 'application/javascript') {
            return next();
        }

        // check cache
        var cached = cache[req_path];
        if (cached) {
            return sendResponse(null, cached);
        }

        // check for bundle
        var bundle = bundles[req_path];
        if (bundle) {
            return generate(bundle, sendResponse);
        }

        var local_file = path.normalize(path.join(pubdir, req_path));

        // check for malicious attempts to access outside of pubdir
        if (local_file.indexOf(pubdir) !== 0) {
            return next();
        }

        // lookup in filesystem
        fs.exists(local_file, function(exists) {
            if (!exists) {
                return next();
            }

            var bundle = browserify(local_file);
            addTransforms(bundle);

            Object.keys(bundles).forEach(function(id) {
                bundle.external(bundles[id]);
            });
            generate(bundle, sendResponse);
        });

        function generate(bundle, callback) {
            var dependencies = {};
            var originalDeps = bundle.deps;

            // typically SyntaxError
            var otherError;
            bundle.once('error', function(err) { otherError = err; });
            if (watch) {
                bundle.on('file', function(file) {
                    dependencies[file] = true;
                });
            }
            bundle.bundle({ debug: debug }, function(err, src) {
                if (watch) {
                    bundle.deps = originalDeps;
                    watchFiles(bundle, dependencies, req_path);
                }
                if (err) {
                    return callback(err);
                }
                if (otherError) {
                    return callback(otherError);
                }
                if (compress) {
                    var result = uglifyjs.minify(src, {
                        fromString: true
                    });

                    src = result.code;
                }
                cache[req_path] = src;

                callback(null, src);
            });
        }

        function sendResponse(err, src) {
            if (err) {
                return next(err);
            }
            res.contentType('application/javascript');
            res.header('ETag', crypto.createHash('md5').update(src).digest('hex').slice(0, 6));
            res.header('Vary', 'Accept-Encoding');
            res.send(src);
        }

        function watchFiles(bundle, dependencies, path) {
            var watchers = Object.keys(dependencies).map(function(filename) {
                return watcher(filename, function() {
                    delete cache[path];
                    generate(bundle, function(error) {
                        watchCallback && watchCallback(error, path);
                    });
                    watchers.forEach(function(watcher) {
                        watcher.close();
                    });
                });
            });
        }
    };
};

