define( [

		// Wire needs to be required as the first dependency in the first file
		// or in your build config set `deps: [ 'wire' ]`.
		// This will force rjs to include wire and its dependenices
		'wire',

		// Require wire specification
		'wire!fixture/spec1',

		// Require multiple wire specifications
		'wire!fixture/spec1,fixture/spec2'

	], function() {

} );
