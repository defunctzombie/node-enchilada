var express = require('express');
var enchilada = require('enchilada');

var app = express();

app.use(enchilada(__dirname + '/public'));

app.use('/', function(req, res) {
    res.sendfile(__dirname + '/index.html');
});

app.listen(8000);
