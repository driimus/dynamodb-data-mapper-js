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
            importMeta: true,
          },
          target: 'es2020',
          keepClassNames: true,
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
      },
    ],
  },
  testEnvironment: 'node',
};
