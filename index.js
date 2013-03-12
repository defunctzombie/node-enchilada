// builtin
var path = require('path');
var fs = require('fs');

// vendor
var mime = require('mime');
var uglifyjs = require('uglify-js');
var httperrors = require('httperrors');
var browserify = require('browserify');

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

    function addTransforms(bundle) {
        if (!opt.transforms) {
            return;
        }
        opt.transforms.forEach(bundle.transform.bind(bundle));
    }

    // if user wants in memory cache, enable it
    if (opt.cache) {
        cache = {};
    }

    // list of files or modules which exist in other bundles
    var externals = [];

    // TODO(shtylman) externs that use other externs?
    var externs = Object.keys(routes).map(function(id) {
        var name = routes[id];

        var opt = {
            // don't bundle require code with externs
            client: false
        };

        var bundle = browserify();
        addTransforms(bundle);
        bundle.expose_all = true;
        bundle.require(name, { expose: true, basedir: pubdir });
        externals.push(name);
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

        var bundle = bundles[req_path];
        if (bundle) {
            return generate(bundle);
        }

        var local_file = path.normalize(path.join(pubdir, req_path));

        // check for malicious attempts to access outside of pubdir
        if (local_file.indexOf(pubdir) !== 0) {
            return next(new httperrors.Forbidden());
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
                return next();
            }

            var bundle = browserify(local_file);
            addTransforms(bundle);

            for (var id in bundles) {
                bundle.require(bundles[id]);
            }

            generate(bundle);
        });

        function generate(bundle) {
            bundle.bundle(function(err, src) {
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
};

