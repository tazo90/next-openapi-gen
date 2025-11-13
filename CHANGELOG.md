## [0.8.6](https://github.com/tazo90/next-openapi-gen/compare/v0.8.5...v0.8.6) (2025-11-13)


### 🐛 Bug Fixes

* support array notation in [@response](https://github.com/response) and [@body](https://github.com/body) annotations (Type[]) ([#55](https://github.com/tazo90/next-openapi-gen/issues/55)) ([006f920](https://github.com/tazo90/next-openapi-gen/commit/006f920176a28c3a1c46390c668e5c346870cb2c))


### 📝 Documentation

* simplify examples section ([7b08c23](https://github.com/tazo90/next-openapi-gen/commit/7b08c23c8ee6a0ef79d82766417178e7e1ec3130))



## [0.8.5](https://github.com/tazo90/next-openapi-gen/compare/v0.8.4...v0.8.5) (2025-11-10)


### ✨ Features

* support Zod factory functions (schema generators) ([#50](https://github.com/tazo90/next-openapi-gen/issues/50)) ([5168100](https://github.com/tazo90/next-openapi-gen/commit/516810003c720dd13d09b8b99d36c02bc316107b))



## [0.8.4](https://github.com/tazo90/next-openapi-gen/compare/v0.8.3...v0.8.4) (2025-11-06)


### 🐛 Bug Fixes

* remove `schemaFiles` and `outputDir` from generated file ([#48](https://github.com/tazo90/next-openapi-gen/issues/48)) ([80bf7a7](https://github.com/tazo90/next-openapi-gen/commit/80bf7a71ef72380774b890effaadddc7c7ea3657))



## [0.8.3](https://github.com/tazo90/next-openapi-gen/compare/v0.8.2...v0.8.3) (2025-11-01)


### ✨ Features

* add --ui none and --output options ([#47](https://github.com/tazo90/next-openapi-gen/issues/47)) ([0c90bcc](https://github.com/tazo90/next-openapi-gen/commit/0c90bcc47ddb09031aa15dbf40eb6a6bf4d64e44))



## [0.8.2](https://github.com/tazo90/next-openapi-gen/compare/v0.8.1...v0.8.2) (2025-10-31)


### ✨ Features

* support for multiple schema types simultaneously ([#46](https://github.com/tazo90/next-openapi-gen/issues/46)) ([c4c09b5](https://github.com/tazo90/next-openapi-gen/commit/c4c09b5dce4dc01c449950c999bce0531737841e))


### 📝 Documentation

* simplify pull request template ([a887ca8](https://github.com/tazo90/next-openapi-gen/commit/a887ca8399aefe6cedef8049d499853f17ad6cf0))



## [0.8.1](https://github.com/tazo90/next-openapi-gen/compare/v0.7.11...v0.8.1) (2025-10-28)


### ✨ Features

* add improved type definitions for schema processing ([2513d19](https://github.com/tazo90/next-openapi-gen/commit/2513d190d8be3087ac64a5e4aeda7fcb7fed0816))
* implement automated release process with changelog generation ([263ac47](https://github.com/tazo90/next-openapi-gen/commit/263ac47dd4c644d57aade84803fd7f4e2d52c56a))


### 🐛 Bug Fixes

* remove contents option from np config to publish root package ([6c0afd8](https://github.com/tazo90/next-openapi-gen/commit/6c0afd8e6a1ac7d777fe328cd49d230e4026f6d1))


### 📝 Documentation

* improve formatting in PR template and contributing guide ([85677dc](https://github.com/tazo90/next-openapi-gen/commit/85677dc05ccfccb263e67254fd204b2cf453025f))


### 🔨 Chores

* add --no-cleanup --no-tests flags to release script ([1e72d77](https://github.com/tazo90/next-openapi-gen/commit/1e72d7717efc5e6b6d435222ccbdeb9a1023e207))
* disable cleanup in np config to avoid npm ci issues ([eb725ee](https://github.com/tazo90/next-openapi-gen/commit/eb725eee5ce4ada8c4db0c1467c425dda93691c7))
* disable tests in np to skip npm ci step ([1325048](https://github.com/tazo90/next-openapi-gen/commit/1325048f052452a1bad493262968a2ab722391b9))
* setup automated release process with np and auto-changelog ([c0e6f7f](https://github.com/tazo90/next-openapi-gen/commit/c0e6f7f394aef96a55123d334fcafaa0058ca541))
* update keywords in package.json ([44140fa](https://github.com/tazo90/next-openapi-gen/commit/44140fa329432e49adfc1fcb746be6bc1dc3928a))



# [0.8.0](https://github.com/tazo90/next-openapi-gen/compare/v0.7.11...v0.8.0) (2025-10-28)


### ✨ Features

* add improved type definitions for schema processing ([2513d19](https://github.com/tazo90/next-openapi-gen/commit/2513d190d8be3087ac64a5e4aeda7fcb7fed0816))


### 📝 Documentation

* improve formatting in PR template and contributing guide ([85677dc](https://github.com/tazo90/next-openapi-gen/commit/85677dc05ccfccb263e67254fd204b2cf453025f))


### 🔨 Chores

* setup automated release process with np and auto-changelog ([c0e6f7f](https://github.com/tazo90/next-openapi-gen/commit/c0e6f7f394aef96a55123d334fcafaa0058ca541))
* update keywords in package.json ([44140fa](https://github.com/tazo90/next-openapi-gen/commit/44140fa329432e49adfc1fcb746be6bc1dc3928a))



## [0.7.11](https://github.com/tazo90/next-openapi-gen/compare/v0.7.10...v0.7.11) (2025-10-23)


### 🐛 Bug Fixes

* support optional/nullable on Zod schema references ([#43](https://github.com/tazo90/next-openapi-gen/issues/43)) ([f791236](https://github.com/tazo90/next-openapi-gen/commit/f7912365b4ad26d3e37c3fed6bfb7e4bd6957e2b))



## [0.7.10](https://github.com/tazo90/next-openapi-gen/compare/v0.7.0...v0.7.10) (2025-10-23)


### ✨ Features

* add configurable output directory for OpenAPI generation ([#31](https://github.com/tazo90/next-openapi-gen/issues/31)) ([d5e7df6](https://github.com/tazo90/next-openapi-gen/commit/d5e7df65491e8532b2910c9d357a4280a5500f55))
* add jsx support to babel parser ([#28](https://github.com/tazo90/next-openapi-gen/issues/28)) ([ebfe1dc](https://github.com/tazo90/next-openapi-gen/commit/ebfe1dc1fcb0a9a90999013805a3931291c84850))
* automatically skip Next.js route groups in path generation ([ff2e67f](https://github.com/tazo90/next-openapi-gen/commit/ff2e67f77805a77061e42a807324ee5d63bc2a8e))


### 🐛 Bug Fixes

* add default values to prevent undefined config properties in getConfig() ([#35](https://github.com/tazo90/next-openapi-gen/issues/35)) ([155e700](https://github.com/tazo90/next-openapi-gen/commit/155e700230dbad61bba686a83002eb41d9792dd0))
* handle z.coerce.TYPE() patterns ([c4655ae](https://github.com/tazo90/next-openapi-gen/commit/c4655ae7ac27fafe1834f2680e80305699f9d470))
* improve JSDoc parsing and File type handling ([3a0de48](https://github.com/tazo90/next-openapi-gen/commit/3a0de4860aa542293fc3628cff991d0d5f724c7e))
* resolve invalid flag usage by branching for yarn and pnpm ([#33](https://github.com/tazo90/next-openapi-gen/issues/33)) ([c9cb322](https://github.com/tazo90/next-openapi-gen/commit/c9cb322b1cc19e8b72dc21a6c664fe2fedca8ee2))
* specify nextjs integration in scalar configuration ([27cf2d6](https://github.com/tazo90/next-openapi-gen/commit/27cf2d638342acfd4f345118da650b4aa4599497))


### 📝 Documentation

* add next15-app-sandbox example ([64cdca3](https://github.com/tazo90/next-openapi-gen/commit/64cdca334184b17c837ca7b9f18eebecbdc3e7f0))
* update sandbox example ([13186a4](https://github.com/tazo90/next-openapi-gen/commit/13186a443b6fb82cac998f3082644202c02bf2fd))
* update scalar example ([ac67ed5](https://github.com/tazo90/next-openapi-gen/commit/ac67ed528ab3307691a357e98ddff5cf52511ac6))
* use latest next-openapi-gen in all examples ([c11a7af](https://github.com/tazo90/next-openapi-gen/commit/c11a7af6e3f471067f7cdc7ac224595297a3be4c))


### 🔨 Chores

* add next15-app-sandbox to .gitignore ([c85a88c](https://github.com/tazo90/next-openapi-gen/commit/c85a88cff988ab26ea4ad7161bf866e69eca311b))
* **config:** add ignoreRoutes option to next.openapi.json ([5ece8c2](https://github.com/tazo90/next-openapi-gen/commit/5ece8c23743eec67ddfc04ceb95cf3ca28545282))
* update dependncies ([8a26465](https://github.com/tazo90/next-openapi-gen/commit/8a26465e7e4fdbe61353d998cbdf79da0f14ed26))



# [0.7.0](https://github.com/tazo90/next-openapi-gen/compare/v0.6.10...v0.7.0) (2025-07-22)


### ✨ Features

* support inline response description ([e9ff5b8](https://github.com/tazo90/next-openapi-gen/commit/e9ff5b8cdc2dd0aa1bfd0bf5099fa7393db1f707))



## [0.6.10](https://github.com/tazo90/next-openapi-gen/compare/v0.6.9...v0.6.10) (2025-07-22)


### ✨ Features

* improve error codes ([8cf001c](https://github.com/tazo90/next-openapi-gen/commit/8cf001ce7d89c1c3e898e37ff8c42d740a7ce748))



## [0.6.9](https://github.com/tazo90/next-openapi-gen/compare/v0.6.8...v0.6.9) (2025-07-22)


### ✨ Features

* allow to change schema type in cli ([3952930](https://github.com/tazo90/next-openapi-gen/commit/3952930f4eef7b5063a81999a2514a379257cc4a))



## [0.6.8](https://github.com/tazo90/next-openapi-gen/compare/v0.6.7...v0.6.8) (2025-07-21)


### ✨ Features

* use zod as default schema for openapi ([#26](https://github.com/tazo90/next-openapi-gen/issues/26)) ([9eac0a3](https://github.com/tazo90/next-openapi-gen/commit/9eac0a30dfa0ad91847bfc9aef505c4fe281c01d))


### 📝 Documentation

* update next15-app-typescript example with Pick/Omit usage ([6d4d76e](https://github.com/tazo90/next-openapi-gen/commit/6d4d76e3cbbb7a2e2a9559c2dfd75ac944f38edb))
* update README.md ([4c75a0c](https://github.com/tazo90/next-openapi-gen/commit/4c75a0ce1389c887012bc8ef3d2ebb6a98e995d1))



## [0.6.7](https://github.com/tazo90/next-openapi-gen/compare/v0.6.6...v0.6.7) (2025-07-18)


### 📝 Documentation

* update next15-app-zod example ([cc38d93](https://github.com/tazo90/next-openapi-gen/commit/cc38d93ff0d1663098d993a5aa41adbcd84c2079))



## [0.6.6](https://github.com/tazo90/next-openapi-gen/compare/v0.6.5...v0.6.6) (2025-07-18)


### ✨ Features

* improve logging ([25405bc](https://github.com/tazo90/next-openapi-gen/commit/25405bc9ff67b310e8cf51eb58ab0b35766e07ec))



## [0.6.5](https://github.com/tazo90/next-openapi-gen/compare/v0.6.4...v0.6.5) (2025-07-17)


### 📝 Documentation

* update zod examples ([6ebd7b6](https://github.com/tazo90/next-openapi-gen/commit/6ebd7b623e1c4bddf875de40ab305e2e42ef5a2f))



## [0.6.4](https://github.com/tazo90/next-openapi-gen/compare/v0.6.3...v0.6.4) (2025-07-12)


### 🐛 Bug Fixes

* typescript errors ([c607431](https://github.com/tazo90/next-openapi-gen/commit/c60743126c5a2d75cbebbc09e76f8ddda8f20880))



## [0.6.3](https://github.com/tazo90/next-openapi-gen/compare/v0.6.2...v0.6.3) (2025-07-12)


### ✨ Features

* add support for response codes ([#22](https://github.com/tazo90/next-openapi-gen/issues/22)) ([e49e360](https://github.com/tazo90/next-openapi-gen/commit/e49e360da20857c083657c662d0dd2f498b0351e))


### 📝 Documentation

* add response codes to README.md ([74b56cf](https://github.com/tazo90/next-openapi-gen/commit/74b56cf94e5e4cca701daceb122f211fd0551fd6))
* multipart/form-data example for typescript ([b0f6e49](https://github.com/tazo90/next-openapi-gen/commit/b0f6e49bd21d8d49274603bfd9622847d75b284d))
* multipart/form-data example for zod ([c9ac74d](https://github.com/tazo90/next-openapi-gen/commit/c9ac74dda77cc4dfd0ed0b60051c321de8b8699f))



## [0.6.2](https://github.com/tazo90/next-openapi-gen/compare/v0.6.1...v0.6.2) (2025-07-08)


### ✨ Features

* add support for multipart/form-data ([#20](https://github.com/tazo90/next-openapi-gen/issues/20)) ([ac4c470](https://github.com/tazo90/next-openapi-gen/commit/ac4c470b74042288f4b52fdc705c1e629d3eda63))



## [0.6.1](https://github.com/tazo90/next-openapi-gen/compare/v0.6.0...v0.6.1) (2025-06-17)


### 📝 Documentation

* update examples to v0.6.0 ([a076b24](https://github.com/tazo90/next-openapi-gen/commit/a076b248193e5403ab61a55e655513163c9efd0a))



# [0.6.0](https://github.com/tazo90/next-openapi-gen/compare/v0.5.6...v0.6.0) (2025-05-29)


### 🐛 Bug Fixes

* support Zod utility methods for schema transformations ([f2e90c7](https://github.com/tazo90/next-openapi-gen/commit/f2e90c7d95d3f452153cae7e424acd10f2a4037e))
* **zod-converter:** resolve string schemas as objects issue ([eefdcb1](https://github.com/tazo90/next-openapi-gen/commit/eefdcb1a966787dc19ff74fc99b6538e0f02bd64))



## [0.5.6](https://github.com/tazo90/next-openapi-gen/compare/v0.5.5...v0.5.6) (2025-05-28)


### ✨ Features

* replace [@desc](https://github.com/desc) into [@description](https://github.com/description) ([14fd38a](https://github.com/tazo90/next-openapi-gen/commit/14fd38a8adcffebe549029dc55ce2ce6527d88a5))


### 📝 Documentation

* update README.md ([089a4fd](https://github.com/tazo90/next-openapi-gen/commit/089a4fd896ffef08382d2ad2e8c0a580e14450e9))



## [0.5.5](https://github.com/tazo90/next-openapi-gen/compare/v0.5.4...v0.5.5) (2025-05-28)


### 🐛 Bug Fixes

* mark zod field as deprecated ([ce1e8fd](https://github.com/tazo90/next-openapi-gen/commit/ce1e8fd769cc9f9e6267712e5fe02761d9ed997c))


### 📝 Documentation

* update README.md ([b56721b](https://github.com/tazo90/next-openapi-gen/commit/b56721b3e2bb074600bebad3fece6e6563f42c86))



## [0.5.4](https://github.com/tazo90/next-openapi-gen/compare/v0.5.3...v0.5.4) (2025-05-28)


### ✨ Features

* add deprecated, body and response description ([#15](https://github.com/tazo90/next-openapi-gen/issues/15)) ([f3119b4](https://github.com/tazo90/next-openapi-gen/commit/f3119b430f4fc24747da74fa2a53e598fee64754))



## [0.5.3](https://github.com/tazo90/next-openapi-gen/compare/v0.5.2...v0.5.3) (2025-05-27)


### 🐛 Bug Fixes

* handle Zod schema references with chained methods in processZodObject ([6a0a2e4](https://github.com/tazo90/next-openapi-gen/commit/6a0a2e462e8e7672bdfc22ec5f44e7f832cae717))



## [0.5.2](https://github.com/tazo90/next-openapi-gen/compare/v5.0.1...v0.5.2) (2025-05-27)


### ✨ Features

* Allow to use z.infer<typeof Schema> in jsdoc ([#14](https://github.com/tazo90/next-openapi-gen/issues/14)) ([6be7f45](https://github.com/tazo90/next-openapi-gen/commit/6be7f455ac952c42b4481111153f4d73b88d07c5))



## [5.0.1](https://github.com/tazo90/next-openapi-gen/compare/v0.5.0...v5.0.1) (2025-05-26)


### ✨ Features

* allow to define custom tag in jsdoc ([4a3d32a](https://github.com/tazo90/next-openapi-gen/commit/4a3d32a007472e660b0c76ca2107ca6bccf99242))


### 📝 Documentation

* update examples ([705b6ce](https://github.com/tazo90/next-openapi-gen/commit/705b6ce2d0989ffd49d239ea653633a617d50afe))



# [0.5.0](https://github.com/tazo90/next-openapi-gen/compare/v0.4.6...v0.5.0) (2025-05-25)


### 📝 Documentation

* add zod and typescript examples ([f8d3216](https://github.com/tazo90/next-openapi-gen/commit/f8d3216107d83aec2763c6961fb62dac46add00d))



## [0.4.6](https://github.com/tazo90/next-openapi-gen/compare/v0.4.5...v0.4.6) (2025-05-18)


### 🐛 Bug Fixes

* use correct types ([c3b61c9](https://github.com/tazo90/next-openapi-gen/commit/c3b61c92d3768e68e1814df6195d3dc17db766b4))



## [0.4.5](https://github.com/tazo90/next-openapi-gen/compare/v0.4.4...v0.4.5) (2025-05-18)


### 🐛 Bug Fixes

* pass schema type to SchemaProcessor ([1362b18](https://github.com/tazo90/next-openapi-gen/commit/1362b1865e7be271f5e50d32db71d934e23279e6))


### 📝 Documentation

* typo in docs ([bab7562](https://github.com/tazo90/next-openapi-gen/commit/bab75628c69bed87e1d0dab4db98e19078e9c46d))



## [0.4.4](https://github.com/tazo90/next-openapi-gen/compare/v0.4.3...v0.4.4) (2025-05-17)


### 📝 Documentation

* update project description ([5868ceb](https://github.com/tazo90/next-openapi-gen/commit/5868cebdebf003fcdc3dcb083bb94bf08574f81f))



## [0.4.3](https://github.com/tazo90/next-openapi-gen/compare/v0.4.2...v0.4.3) (2025-05-17)


### 🐛 Bug Fixes

* use template in getConfig method ([8a22e47](https://github.com/tazo90/next-openapi-gen/commit/8a22e47fdc7d37251d81001618443ff89dfbdafb))



## [0.4.2](https://github.com/tazo90/next-openapi-gen/compare/v0.4.1...v0.4.2) (2025-05-17)


### 🐛 Bug Fixes

* imports by adding .js ([b08f12f](https://github.com/tazo90/next-openapi-gen/commit/b08f12f8016a1e64ef2177e0b04551d1c95d7a7c))


### 📝 Documentation

* missing command in readme.md ([c54620a](https://github.com/tazo90/next-openapi-gen/commit/c54620a31db2dc92c51f2bda0e8c3570f329173e))



## [0.4.1](https://github.com/tazo90/next-openapi-gen/compare/v0.4.0...v0.4.1) (2025-05-17)


### 🐛 Bug Fixes

* ignore small typescript errors ([8f43c39](https://github.com/tazo90/next-openapi-gen/commit/8f43c396260ebc04361ab14f37b60e52fb10e736))



# [0.4.0](https://github.com/tazo90/next-openapi-gen/compare/v0.3.3...v0.4.0) (2025-05-17)


### 📝 Documentation

* extend examples for scalar and swagger ([2aab3d7](https://github.com/tazo90/next-openapi-gen/commit/2aab3d7371187d701c60545ba771a5cc3aa13195))
* fix header in readme.md ([9a65df9](https://github.com/tazo90/next-openapi-gen/commit/9a65df9d7973dcfcd0af1eb5323c5a7794d200ce))
* fix typo ([ebf5e25](https://github.com/tazo90/next-openapi-gen/commit/ebf5e25013b5afcb9bbe7a03f61c216ef755da2b))
* update readme.md ([e7be2df](https://github.com/tazo90/next-openapi-gen/commit/e7be2df36f7ddb982f2cceea8014e4f3873a8e1d))



## [0.3.3](https://github.com/tazo90/next-openapi-gen/compare/v0.3.2...v0.3.3) (2025-05-15)


### 🐛 Bug Fixes

* do not use semicolons in jsdoc ([b866133](https://github.com/tazo90/next-openapi-gen/commit/b8661336a4fff39cf9bdb782104186fca1fc252f))
* typescript issue ([3fd4ea4](https://github.com/tazo90/next-openapi-gen/commit/3fd4ea4df25adf33bfe4e720a269754e946cda42))



## [0.3.2](https://github.com/tazo90/next-openapi-gen/compare/v0.3.1...v0.3.2) (2025-05-14)


### ✨ Features

* improve more advanced nested routes ([1bb9843](https://github.com/tazo90/next-openapi-gen/commit/1bb98439d6023c5cbe6d511a270c0239e62b6bbb))



## [0.3.1](https://github.com/tazo90/next-openapi-gen/compare/v0.3.0...v0.3.1) (2025-05-12)


### 🐛 Bug Fixes

* missing import in route-processor ([e2c8fd2](https://github.com/tazo90/next-openapi-gen/commit/e2c8fd2bb85e41ee7ccc930afca96f362edceb04))



# [0.3.0](https://github.com/tazo90/next-openapi-gen/compare/v0.2.2...v0.3.0) (2025-05-12)


### ✨ Features

* support dynamic routes ([9a494f1](https://github.com/tazo90/next-openapi-gen/commit/9a494f1fd840537ac5743a828e2f3f6db9eb87ca))


### 📝 Documentation

* mark scalar as new option ([41c857b](https://github.com/tazo90/next-openapi-gen/commit/41c857bb6264c0fb22ed8f8545357ce279360c37))
* tidy up ([5e964af](https://github.com/tazo90/next-openapi-gen/commit/5e964af66fe481f48035b64beeb2f3e2b9212f64))
* update image in readme.md ([ac41449](https://github.com/tazo90/next-openapi-gen/commit/ac41449add64dda06f9f435a79ad87bdc66496b6))
* update new icon ([71e67c0](https://github.com/tazo90/next-openapi-gen/commit/71e67c0146fa3e698963aca4374ad6553ea1444a))



## [0.2.2](https://github.com/tazo90/next-openapi-gen/compare/v0.2.1...v0.2.2) (2025-05-06)


### 📝 Documentation

* add next15 example for scalar and swagger ([58c4748](https://github.com/tazo90/next-openapi-gen/commit/58c4748d4b60b0330a1c1c5cc84393d8e83f836b))



## [0.2.1](https://github.com/tazo90/next-openapi-gen/compare/v0.2.0...v0.2.1) (2025-05-06)


### ✨ Features

* add scalar ui and make it default interface ([aa093c0](https://github.com/tazo90/next-openapi-gen/commit/aa093c01e1d31aefb212b6bb2031ebeb1ae713fe))



# [0.2.0](https://github.com/tazo90/next-openapi-gen/compare/v0.1.2...v0.2.0) (2025-05-06)


### 🐛 Bug Fixes

* ensure LF line endings for compatibility ([#4](https://github.com/tazo90/next-openapi-gen/issues/4)) ([#5](https://github.com/tazo90/next-openapi-gen/issues/5)) ([ad62610](https://github.com/tazo90/next-openapi-gen/commit/ad6261004a5d89626e9813da45b68ecfb22a62f3))


### 📝 Documentation

* add next-15 app example ([150cc8d](https://github.com/tazo90/next-openapi-gen/commit/150cc8d08b1398e8f834c282ec5f74ca42cff7ab))


### 🔨 Chores

* upgrade dependencies of example to latest versions ([066e42c](https://github.com/tazo90/next-openapi-gen/commit/066e42ce6c96fb013d86852630efa1a3bd4c3a29))



## [0.1.2](https://github.com/tazo90/next-openapi-gen/compare/v0.1.1...v0.1.2) (2024-11-12)


### 🐛 Bug Fixes

* check if api dir always exists ([7eac702](https://github.com/tazo90/next-openapi-gen/commit/7eac7027eb8743982828501e862f955792fe2901))



## [0.1.1](https://github.com/tazo90/next-openapi-gen/compare/v0.0.19...v0.1.1) (2024-11-12)


### ♻️ Code Refactoring

* remove demo.png ([fd9d4d9](https://github.com/tazo90/next-openapi-gen/commit/fd9d4d90ac407139834d2db937069dcc13da6ca5))


### 🐛 Bug Fixes

* add missing swagger-ui-react dependency ([#2](https://github.com/tazo90/next-openapi-gen/issues/2)) ([3ebb936](https://github.com/tazo90/next-openapi-gen/commit/3ebb9360f30544ade41948f26b4b207029a32ec4))
* use --legacy-peer-deps because swagger-ui-react does not support react19 now ([e9a7322](https://github.com/tazo90/next-openapi-gen/commit/e9a73221c8826b51145c9c3db5bf21b8b5faf1cf))


### 📝 Documentation

* add more examples to README.md ([d5cc052](https://github.com/tazo90/next-openapi-gen/commit/d5cc0522ca2ad7bd206337f65d2b8c1f92c126a0))
* typo ([6688256](https://github.com/tazo90/next-openapi-gen/commit/6688256ebce8e52ac2fdb16beb8ddc915e0e4f91))
* update docs ([c1d5bbd](https://github.com/tazo90/next-openapi-gen/commit/c1d5bbdc3e9d269f0795046fdbb44b92719b97b6))
* update README.md ([bd715fa](https://github.com/tazo90/next-openapi-gen/commit/bd715fa3eec9207c3d7fce0cd1d8a69b899805fe))



## [0.0.19](https://github.com/tazo90/next-openapi-gen/compare/v0.0.15...v0.0.19) (2024-11-03)


### ✨ Features

* add demo gif to repo ([b02c361](https://github.com/tazo90/next-openapi-gen/commit/b02c36125361c51c84e54b4523bd0d4f9585f4c9))
* add example assets ([fd12d23](https://github.com/tazo90/next-openapi-gen/commit/fd12d23ebaf5dbcd2c42c5dc9d40d04c1eeb0a15))
* add field description in params ([c22091e](https://github.com/tazo90/next-openapi-gen/commit/c22091ebea8b25c77fd29498c4d7f4ba30acc3eb))
* handle nested typescript types ([de1b576](https://github.com/tazo90/next-openapi-gen/commit/de1b576f0f1f8950250d344f78aa1fdb834c0a93))
* support anyOf as support type ([6fba2a5](https://github.com/tazo90/next-openapi-gen/commit/6fba2a5a5fd77a5e2dc850dba69ad47714544045))
* support ts enums ([647375d](https://github.com/tazo90/next-openapi-gen/commit/647375d0f5ea51028346af0728f990df5ac5ee1c))


### 🐛 Bug Fixes

* return correct value in request body section ([ba12a4e](https://github.com/tazo90/next-openapi-gen/commit/ba12a4e47ea66e9fa6e1cffeb2a717f5ac54bd5d))
* ts errors ([0261399](https://github.com/tazo90/next-openapi-gen/commit/02613991fda83667323cacb1e9f4daa6f13e3d01))


### 📝 Documentation

* add demo to readme.md ([12c5e19](https://github.com/tazo90/next-openapi-gen/commit/12c5e19701d47dc4663e8ea1898d103d54b01e66))
* add interface providers to readme ([d9c6df8](https://github.com/tazo90/next-openapi-gen/commit/d9c6df88f2306c7f373eb4e35e2485146f571e93))
* refactoring ([47f8db5](https://github.com/tazo90/next-openapi-gen/commit/47f8db5cfe17680e4720afa08d03752e3b44980c))
* remove zod schema info ([2449767](https://github.com/tazo90/next-openapi-gen/commit/2449767b7abd47c21d33e295abcbae6f7716d8a1))



## [0.0.15](https://github.com/tazo90/next-openapi-gen/compare/v0.0.14...v0.0.15) (2024-10-22)


### 🐛 Bug Fixes

* invalid stoplight dependences ([dee1fab](https://github.com/tazo90/next-openapi-gen/commit/dee1fab538723415f88146c27093d36403e83a12))



## [0.0.14](https://github.com/tazo90/next-openapi-gen/compare/v0.0.13...v0.0.14) (2024-10-22)


### 🐛 Bug Fixes

* allow to use multiple interface pages ([9bc4dc1](https://github.com/tazo90/next-openapi-gen/commit/9bc4dc172649684c7bb71b8306139fcb97ac3096))


### 📝 Documentation

* typo in readme ([d5aeb1b](https://github.com/tazo90/next-openapi-gen/commit/d5aeb1b769c0e45acd893ce138bd14225083600d))
* update readme ([16fa409](https://github.com/tazo90/next-openapi-gen/commit/16fa4096a2af8261ce6f0636f744a3d7c871f125))



## [0.0.13](https://github.com/tazo90/next-openapi-gen/compare/v0.1.12...v0.0.13) (2024-10-22)


### ✨ Features

* add rapidoc integration ([5e5963f](https://github.com/tazo90/next-openapi-gen/commit/5e5963ff8a6b88c02c699a3ca52d5dcd93f282ff))
* add redoc interface ([6bff4f3](https://github.com/tazo90/next-openapi-gen/commit/6bff4f395a8badc8ca9c12eef09f02b11aff35c6))
* add stoplight elements integration ([2e75cd6](https://github.com/tazo90/next-openapi-gen/commit/2e75cd626a80baf727e4267cb2ce524a7a8b9304))


### 📝 Documentation

* update readme.md ([522a742](https://github.com/tazo90/next-openapi-gen/commit/522a7426ec926a72803d57844d357fb626cba358))



## [0.1.12](https://github.com/tazo90/next-openapi-gen/compare/v0.0.11...v0.1.12) (2024-10-21)


### ✨ Features

* support decorators ([3423bb1](https://github.com/tazo90/next-openapi-gen/commit/3423bb1b00c808c50d403ac3ec69cfd25e860e1c))



## [0.0.11](https://github.com/tazo90/next-openapi-gen/compare/v0.0.10...v0.0.11) (2024-10-21)


### ✨ Features

* support monorepos ([be9dc70](https://github.com/tazo90/next-openapi-gen/commit/be9dc703233952bfaa08e441a3f92421d40b37fe))



## [0.0.10](https://github.com/tazo90/next-openapi-gen/compare/v0.0.9...v0.0.10) (2024-10-21)


### 📝 Documentation

* Update README.md and package description ([f3294cf](https://github.com/tazo90/next-openapi-gen/commit/f3294cfdd2f06311a05fcdabba24785171d81702))



## [0.0.9](https://github.com/tazo90/next-openapi-gen/compare/v0.0.8...v0.0.9) (2024-10-16)


### ✨ Features

* add authentication on route level ([8f1fc4f](https://github.com/tazo90/next-openapi-gen/commit/8f1fc4f81cdc18240d688b047c08015abac45baa))



## [0.0.8](https://github.com/tazo90/next-openapi-gen/compare/v0.0.7...v0.0.8) (2024-10-16)


### 🐛 Bug Fixes

* add /api prefix to servers url ([53ba3a6](https://github.com/tazo90/next-openapi-gen/commit/53ba3a652422ae3de6fcb6a137d0e841da89cdb4))



## [0.0.7](https://github.com/tazo90/next-openapi-gen/compare/v0.0.6...v0.0.7) (2024-10-16)


### 🐛 Bug Fixes

* update config variables ([57132cf](https://github.com/tazo90/next-openapi-gen/commit/57132cf138c4c16184aae8d0e5ee237b66fb8cc2))



## [0.0.6](https://github.com/tazo90/next-openapi-gen/compare/v0.0.5...v0.0.6) (2024-10-16)


### 🐛 Bug Fixes

* update bin path in package.json ([fd9074a](https://github.com/tazo90/next-openapi-gen/commit/fd9074aef9fa474dcd1199bf2608d81df31137d1))



## [0.0.5](https://github.com/tazo90/next-openapi-gen/compare/v0.0.4...v0.0.5) (2024-10-14)


### ♻️ Code Refactoring

* update init command params ([7ced6ad](https://github.com/tazo90/next-openapi-gen/commit/7ced6adb0d1d81428a91e952bd5d1174ba3cb34a))


### 🐛 Bug Fixes

* correct default option for ui param ([206b02e](https://github.com/tazo90/next-openapi-gen/commit/206b02eba2a0c4368b9eeb94502e1023a3831ed1))


### 🔨 Chores

* buml to v0.0.5 ([ec0b6e0](https://github.com/tazo90/next-openapi-gen/commit/ec0b6e075305bfd918c6bf3d20186d0fd0e204ce))



## [0.0.4](https://github.com/tazo90/next-openapi-gen/compare/v0.0.3...v0.0.4) (2024-10-14)


### ♻️ Code Refactoring

* split codebase and code cleaning ([f126ce3](https://github.com/tazo90/next-openapi-gen/commit/f126ce3ddf60b301a5bb23de1e7b6308d5802280))


### ✨ Features

* handle routes defined as functions ([ecfd86b](https://github.com/tazo90/next-openapi-gen/commit/ecfd86bd81deed88abba2650e66dea581cd6850b))



## [0.0.3](https://github.com/tazo90/next-openapi-gen/compare/v0.0.2...v0.0.3) (2024-10-05)



## [0.0.2](https://github.com/tazo90/next-openapi-gen/compare/v0.0.1...v0.0.2) (2024-10-05)


### 🐛 Bug Fixes

* build ts errors ([653aa37](https://github.com/tazo90/next-openapi-gen/commit/653aa371586eb18152d0de614958af434e8472f1))



## [0.0.1](https://github.com/tazo90/next-openapi-gen/compare/d657b620eb5d8968413f596ee1a1ac5bb9e4c092...v0.0.1) (2024-10-05)


### 🔨 Chores

* update package.json ([d657b62](https://github.com/tazo90/next-openapi-gen/commit/d657b620eb5d8968413f596ee1a1ac5bb9e4c092))



