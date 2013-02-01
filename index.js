// builtin
var path = require('path');
var fs = require('fs');

// vendor
var mime = require('mime');
var script = require('script');
var uglifyjs = require('uglify-js');
var httperrors = require('httperrors');

module.exports = function enchilada(opt) {

    // if just a path is passed in, treat as public file dir
    if (typeof opt === 'string') {
        opt = { src: opt };
    }

    var pubdir = opt.src;
    var routes = opt.routes || {};
    var bundles = {};

    var compress = false || opt.compress;
    var cache;

    // if user wants in memory cache, enable it
    if (opt.cache) {
        cache = {};
    }

    // TODO(shtylman) externs that use other externs?
    var externs = Object.keys(routes).map(function(id) {
        var name = routes[id];

        var opt = {
            // don't bundle require code with externs
            client: false
        };

        // if the name is not relative, then it is a module
        if (name[0] !== '.') {
            return bundles[id] = script.module(name, opt);
        }

        var jsfile = path.normalize(path.join(pubdir, id));
        return bundles[id] = script.file(jsfile, opt);
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
        };

        // TODO(shtylman) option to specify path for require.js file?
        if (req_path === '/js/require.js') {
            res.sendfile(script.client.filename);
            return;
        }

        var bundle = bundles[req_path];
        if (bundle) {
            return generate(bundle);
        }

        var local_file = path.normalize(path.join(pubdir, req_path));

        // check for malicious attempts to access outside of pubdir
        if (local_file.indexOf(pubdir) !== 0) {
            return next(new httperrors.Forbidden());
        }

        // skip things we don't know about
        if (!fs.existsSync(local_file)) {
            return next();
        }

        // check cache, opt.cache enables cache
        if (cache) {
            var cached = cache[req_path];
            if (cached) {
                res.contentType('application/javascript');
                return res.send(cached);
            }
        }

        // lookup in filesystem
        fs.exists(local_file, function(exists) {
            if (!exists) {
                return next(new httperrors.NotFound());
            }

            var bundle = script.file(local_file, {
                // if no external bundles are used, then package require code with each file
                client: externs.length === 0,
                main: true,
                external: externs
            });

            generate(bundle);
        });

        function generate(bundle) {
            bundle.generate(function(err, src) {
                if (err) {
                    return next(err);
                }

                if (compress) {
                    var result = uglifyjs.minify(src, {
                        fromString: true
                    });

                    src = result.code;
                }

                if (cache) {
                    cache[req_path] = src;
                }

                res.contentType('application/javascript');
                res.send(src);
            });
        }
    };
}

