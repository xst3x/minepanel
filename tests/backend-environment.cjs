const { TestEnvironment } = require('jest-environment-node');

// Clean up application housekeeping after every suite's afterAll hooks finish.
class BackendEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.intervals = new Set();
    this.timeouts = new Set();
    const setInterval = this.global.setInterval;
    const setTimeout = this.global.setTimeout;
    this.global.setInterval = (...args) => {
      const timer = setInterval(...args);
      this.intervals.add(timer);
      return timer;
    };
    this.global.setTimeout = (...args) => {
      const timer = setTimeout(...args);
      this.timeouts.add(timer);
      return timer;
    };
  }
  async teardown() {
    for (const timer of this.intervals) clearInterval(timer);
    for (const timer of this.timeouts) clearTimeout(timer);
    await super.teardown();
  }
}
module.exports = BackendEnvironment;
