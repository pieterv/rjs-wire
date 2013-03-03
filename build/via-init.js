
/** @license MIT License (c) copyright B Cavalier & J Hann */

/*jshint sub:true*/

/**
 * wire
 * Javascript IOC Container
 *
 * wire is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @version 0.9.1
 */
(function(rootSpec, define){ 
define('wire/wire',['require','./lib/context'],function(require) {

	var createContext, rootContext, rootOptions;

	wire.version = '0.9.1';

	createContext = require('./lib/context');

	rootOptions = { require: require };

	/**
	 * Main Programmtic API.  The top-level wire function that wires contexts
	 * as direct children of the (possibly implicit) root context.  It ensures
	 * that the root context has been wired before wiring children.
	 *
	 * @public
	 *
	 * @param spec {Object|String|Array|Promise} can be any one of the following:
	 *  1. Object - wiring spec
	 *  2. String - module id of the wiring spec to load and then wire
	 *  3. Array - mixed array of Strings and Objects, each of which is either
	 *   a wiring spec, or the module id of a wiring spec
	 *  4. Promise - a promise for any of the above
	 *  @param options {Object} wiring options
	 *  @param [options.require] {Function} the platform loader function.  Wire will
	 *   attempt to automatically detect what loader to use (AMD, CommonJS, etc.), but
	 *   if you want to explicitly provide it, you can do so.  In some cases this can
	 *   be useful such as providing a local AMD require function so that module ids
	 *   *within the wiring spec* can be relative.
	 *  @return {Promise} a promise for the resulting wired context
	 */
	function wire(spec, options) {

		// If the root context is not yet wired, wire it first
		if (!rootContext) {
			rootContext = createContext(rootSpec, null, rootOptions);
		}

		// Use the rootContext to wire all new contexts.
		return rootContext.then(function (root) {
			return root.wire(spec, options);
		});
	}

	/**
	 * AMD Loader plugin API
	 * @param name {String} spec module id, or comma-separated list of module ids
	 * @param require {Function} loader-provide local require function
	 * @param callback {Function} callback to call when wiring is completed. May have
	 *  and error property that a function to call to inform the AMD loader of an error.
	 *  See here: https://groups.google.com/forum/?fromgroups#!topic/amd-implement/u0f161drdJA
	 */
	wire.load = function amdLoad(name, require, callback /*, config */) {
		// If it's a string, try to split on ',' since it could be a comma-separated
		// list of spec module ids
		var errback = callback.error || function(e) {
			// Throw uncatchable exception for loaders that don't support
			// AMD error handling.  This will propagate up to the host environment
			setTimeout(function() { throw e; }, 0);
		};

		wire(name.split(','), { require: require }).then(callback, errback);
	};

	/**
	 * AMD Builder plugin API
	 */
	// pluginBuilder: './builder/rjs'
	wire['pluginBuilder'] = './builder/rjs';
	wire['cramPlugin'] = './builder/cram';

	return wire;

});
})(
	this['wire'] || {},
	typeof define == 'function' && define.amd
		? define : function(factory) { module.exports = factory(require); }
);
define('wire', ['wire/wire'], function (main) { return main; });

define('fixture/spec1', ['fixture/module1', 'fixture/spec2'], {

		module1: {
		module: 'fixture/module1'
	},

		some_child_spec: {
		spec: 'fixture/spec2'
	}
} );

define('fixture/module1',[], function() {

	return true;
} );

define('fixture/spec2', ['fixture/module2'], {

		some_data: {
		foo: 'bar'
	},

		module2: {
		module: 'fixture/module2'
	}
} );

define('fixture/module2', [ './module1' ], function( module1 ) {

	return module1;
} );

define('fixture/init', [

		// Wire needs to be required as the first dependency in the first file
		// or in your build config set `deps: [ 'wire' ]`.
		// This will force rjs to include wire and its dependenices
		// 'wire',

		// Require wire specification
		'wire!fixture/spec1',

		// Require multiple wire specifications
		'wire!fixture/spec1,fixture/spec2'

	], function() {

} );
