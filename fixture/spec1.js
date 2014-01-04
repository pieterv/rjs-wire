// stuff
define( {

	// Include basic module
	module1: {
		module: 'fixture/module1'
	},

	// Include child wire specification
	some_child_spec: {
		spec: 'fixture/spec2'
	},

	$plugins: [
		'fixture/plugin1',
		{ module: 'fixture/plugin2' }
	]
} );
