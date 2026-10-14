// SPDX-License-Identifier: MIT
export default {
  name: 'example-rule', priority: 100,
  apply(text, context, config) {
    return { action: 'pass' };
  },
};
