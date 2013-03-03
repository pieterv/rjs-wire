({
	baseUrl: './',
	packages: [
		{ name: 'wire', location: 'components/wire', main: 'wire.js' },
		{ name: 'when', location: 'components/when', main: 'when.js' }
	],
	optimize: 'none',

	name: 'fixture/init',
	out: 'build/via-init.js'
})
