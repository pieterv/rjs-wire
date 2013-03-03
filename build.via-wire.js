({
	baseUrl: './',
	packages: [
		{ name: 'wire', location: 'components/wire', main: 'wire.js' },
		{ name: 'when', location: 'components/when', main: 'when.js' }
	],
	optimize: 'none',

	deps: [ 'wire' ],
	name: 'wire!fixture/spec1,fixture/spec2',
	out: 'build/via-wire.js'
})
