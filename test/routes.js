var assert = require('assert');
var vm = require('vm');

var request = require('supertest');
var express = require('express');
var after = require('after');

var enchilada = require('../');

var app = express();

suite('routes');

test('setup', function(done) {
    app.use(enchilada({
        src: __dirname + '/assets',
        routes: {
            '/foo.js': './foo.js',
            '/cats-module.js': 'cats-module'
        }
    }));
    app.listen(done);
});

test('/foo.js - should run', function(done) {
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
        done();
    });
});

test('/baz.js - entry', function(done) {

    // done is called inside every module file
    // and once at the end of response
    done = after(5, done);

    request(app)
    .get('/foo.js')
    .end(function(err, res) {

        var sandbox = {
            done: done,
            assert: assert
        };

        // inject foo into scope
        var src = res.text;
        vm.runInNewContext(src, sandbox);

        // load baz and run that too
        request(app)
        .get('/baz.js')
        .end(function(err, res) {
            assert.equal(res.statusCode, 200);
            assert.equal(res.headers['content-type'], 'application/javascript');

            var src = res.text;
            vm.runInNewContext(src, sandbox);

            // run again, the entry will be re-run, but if foo.js is proper external
            // it will not be re-run (thus done will be called only 4 times)
            vm.runInNewContext(src, sandbox);

            done();
        });
    });
});

test('/cats-module.js - should run', function(done) {

    done = after(2, done);

    request(app)
    .get('/cats-module.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        vm.runInNewContext(src, sandbox);
        done();
    });
});

test('/cats.js - entry', function(done) {
    done = after(4, done);

    request(app)
    .get('/cats-module.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        vm.runInNewContext(src, sandbox);

        request(app)
        .get('/cats.js')
        .end(function(err, res) {
            assert.equal(res.statusCode, 200);
            assert.equal(res.headers['content-type'], 'application/javascript');

            var src = res.text;
            vm.runInNewContext(src, sandbox);

            // and again to make sure we did not include the module source
            vm.runInNewContext(src, sandbox);
            done();
        });
    });
});
