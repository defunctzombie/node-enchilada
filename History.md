# 0.13.0 (2015-10-27)

	* update convert-source-map for stack overflow fix
	* use ready-signal to de-duplicate same file loading

# 0.12.0 (2015-01-20)

	* send 304 for If-None-Match matches ETag

# 0.11.0 (2014-09-28)

	* add uglify options support to `compress` option

# 0.10.0 (2014-09-19)

	* fix file watching and multiple bundle build race
	* use filewatcher module for file watching

# 0.7.1 - 2014/1/4

	* sourceMappingUrl is relative file path

# 0.7.0 - 2014/1/3

	* Strip sourcemaps from js files and server under separate map url
	* update browserify to 3.x line 3.18.0

# 0.6.0

	* Support for regular connect and regular http servers

# 0.5.1

	* update browserify to 2.36.0

# 0.5.0

	* bundles from "routes" are now also entry files and run automatically
	when loaded on the page
