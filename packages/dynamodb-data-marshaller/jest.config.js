module.exports = {
  transform: {
    '\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
            decoratorsBeforeExport: true,
          },
          target: 'es2020',
          keepClassNames: true,
        },
      },
    ],
  },
  testEnvironment: 'node',
};
