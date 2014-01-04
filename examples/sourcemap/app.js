var express = require('express');
var enchilada = require('enchilada');

var app = express();

// middleware to limit access to sourcemaps
app.use(function(req, res, next) {
    // req.path removes querystrings
    // or you can test with indexOf
    if (/\.map\.json$/.test(req.path)) {
        // determine whether to show or not show the sourcemap
        //return next(new Error(...));
    }

    // allow all other requests to continue on
    next();
})

app.use(enchilada({
    src: __dirname + '/public',
    debug: true,
    compress: true
}));

app.use('/', function(req, res) {
    res.sendfile(__dirname + '/index.html');
});

app.listen(8000);
