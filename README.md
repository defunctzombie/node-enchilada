# enchilada [![Build Status](https://secure.travis-ci.org/shtylman/node-enchilada.png?branch=master)](http://travis-ci.org/shtylman/node-enchilada)

serve up your javascript files all wrapped up using [browserify](https://github.com/substack/node-browserify). Yum!

```javascript
var app = express();

// serves up all your javascript files, handling all require() calls
app.use(enchilada(__dirname + '/public'));

// fallback for other static resources
app.use(express.static(__dirname + '/public'));
```

Now just visit any ```.js``` url which maps to a path under /public and the packaged file will be served.

## with ingredients

No one likes a stale enchilada. Out in the real world, you want to leverage browser caching for rarely changing files. Imagine that your project uses files like jquery or [engine.io](https://github.com/LearnBoost/engine.io-client), these files don't change as much as your app code. It would be silly to keep sending them with every js file you serve up. Enchilada makes this easy to do.

Just add the proper ingredients and your enchilada will be served up as you requested.

```javascript
app.use(enchilada({
    src: __dirname + '/public', // location of your js files
    cache: true || false, // default false
    compress: true || false, // default false
    routes: {
        // key is the url route, value is either a file relative to src
        '/js/jquery.js': './js/jquery.js',
        // or a module installed via npm
        '/js/engine.io.js': 'engine.io-client'
    },
    transforms: [ handleify, brfs ]
}));
```

Now just make sure you load the required scripts before any other js file that might use them.

```html
<!-- load the scripts we know will be used by several files -->
<script src="/js/jquery.js"></script>
<script src="/js/engine.io.js"></script>

<!-- load other js files as you would before -->
<script src="/js/app.js"></script>
```

## examples

See the [examples](examples) directory for working code you can copy and paste.

## install

Install with [npm](https://npmjs.org)

```shell
npm install enchilada
```
