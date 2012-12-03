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

    var externs = Object.keys(routes).map(function(id) {
        var name = routes[id];

        // if the name is not relative, then it is a module
        if (name[0] !== '.') {
            return bundles[id] = script.module(name);
        }

        var jsfile = path.normalize(path.join(pubdir, id));
        return bundles[id] = script.file(jsfile);
    });

    return function(req, res, next) {
        if (mime.lookup(req.path) !== 'application/javascript') {
            return next();
        };

        var url = path.normalize(path.join(pubdir, req.path));

        // check for malicious attempts to access outside of pubdir
        if (url.indexOf(pubdir) !== 0) {
            return next(new httperrors.Forbidden());
        }

        res.contentType('application/javascript');

        // TODO(shtylman) option to specify path for require.js file?
        if (req.url === '/js/require.js') {
            res.sendfile(script.client.filename);
            return;
        }

        // check cache, opt.cache enables cache
        if (cache) {
            var cached = cache[url];
            if (cached) {
                return res.send(cached);
            }
        }

        var bundle = bundles[url];
        if (bundle) {
            return generate(bundle);
        }

        // lookup in filesystem
        fs.exists(url, function(exists) {
            if (!exists) {
                return next(new httperrors.NotFound());
            }

            var bundle = script.file(url, {
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
                    cache[url] = src;
                }

                res.send(src);
            });
        }
    };
}

