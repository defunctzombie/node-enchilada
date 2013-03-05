var assert = require('assert');
var vm = require('vm');

var request = require('supertest');
var express = require('express');
var after = require('after');
var through = require('through');

var enchilada = require('../');

var app = express();
var transformed = false;

test('setup', function(done) {
    app.use(enchilada({
        src:__dirname + '/assets',
        configure:function(bundle) {
            assert.ok(bundle);
            assert.ok(bundle.transform);
            transformed = true;
        },
        transforms: [ function(file) {
            assert.ok(/\.js$/.test(file));
            return through(
                function write(data) {
                    assert.ok(data);
                    this.queue(data);
                },
                function end() {
                    transformed = true;
                    this.queue(null);
                }
            );
        } ]
    }));
    app.listen(done);
});

test('transform called', function(done) {
    done = after(3, done);

    request(app)
    .get('/foo.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        vm.runInNewContext(src, sandbox);
        assert.ok(transformed);
        done();
    });
});

