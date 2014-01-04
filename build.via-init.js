({
	baseUrl: './',
	paths: {
		'wire/builder/rjs': 'node_modules/wire-rjs-builder/builder'
	},
	packages: [
		{ name: 'wire', location: 'node_modules/wire', main: 'wire' },
		{ name: 'when', location: 'node_modules/when', main: 'when' },
		{ name: 'meld', location: 'node_modules/meld', main: 'meld' }
	],
	optimize: 'none',

	name: 'fixture/init',
	out: 'build/via-init.js'
})
