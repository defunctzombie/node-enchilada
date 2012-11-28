// builtin
var path = require('path');

// vendor
var mime = require('mime');
var script = require('script');
var uglifyjs = require('uglify-js');

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
        if (mime.lookup(req.url) !== 'application/javascript') {
            return next();
        };

        res.contentType('application/javascript');

        // TODO(shtylman) option to specify path for require.js file?
        if (req.url === '/js/require.js') {
            res.sendfile(script.client.filename);
            return;
        }

        // check cache, opt.cache enables cache
        if (cache) {
            var cached = cache[req.url];
            if (cached) {
                return res.send(cached);
            }
        }

        var bundle = bundles[req.url];

        // lookup in filesystem
        if (!bundle) {
            var jsfile = path.join(pubdir, req.url);
            bundle = script.file(jsfile, {
                main: true,
                external: externs
            });
        }

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
                cache[req.url] = src;
            }

            res.send(src);
        });
    };
}

