const { spawn } = require('child_process');
const path = require('path');

class StressTestRunner {
    constructor(concurrentTests = 50) {
        this.concurrentTests = concurrentTests;
        this.results = [];
        this.startTime = null;
        this.endTime = null;
        this.completedTests = 0;
        this.failedTests = 0;
        this.runningTests = new Set();
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [STRESS-TEST] ${message}`);
    }

    async runSingleTest(testId) {
        return new Promise((resolve, reject) => {
            this.log(`Starting test instance ${testId}`);

            const testProcess = spawn('node', ['integration-test.js'], {
                cwd: __dirname,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.runningTests.add(testProcess);

            let stdout = '';
            let stderr = '';

            testProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            testProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            testProcess.on('close', (code) => {
                this.runningTests.delete(testProcess);
                this.completedTests++;

                const result = {
                    testId,
                    exitCode: code,
                    stdout,
                    stderr,
                    success: code === 0,
                    duration: Date.now() - this.startTime
                };

                this.results.push(result);

                if (code === 0) {
                    this.log(`✅ Test ${testId} completed successfully`);
                } else {
                    this.log(`❌ Test ${testId} failed with exit code ${code}`);
                    this.failedTests++;
                }

                resolve(result);
            });

            testProcess.on('error', (error) => {
                this.runningTests.delete(testProcess);
                this.completedTests++;
                this.failedTests++;

                const result = {
                    testId,
                    exitCode: -1,
                    stdout,
                    stderr,
                    error: error.message,
                    success: false,
                    duration: Date.now() - this.startTime
                };

                this.results.push(result);
                this.log(`💥 Test ${testId} crashed: ${error.message}`);
                resolve(result);
            });

            // Timeout after 5 minutes per test
            /*
            setTimeout(() => {
                if (this.runningTests.has(testProcess)) {
                    this.log(`⏰ Test ${testId} timed out, killing process`);
                    testProcess.kill('SIGTERM');

                    setTimeout(() => {
                        if (this.runningTests.has(testProcess)) {
                            testProcess.kill('SIGKILL');
                        }
                    }, 5000);
                }
            }, 5 * 60 * 1000);
            */
        });
    }

    async runStressTest() {
        this.log(`🚀 Starting stress test with ${this.concurrentTests} concurrent test instances`);
        this.log('='.repeat(80));

        this.startTime = Date.now();

        // Create an array of test promises
        const testPromises = [];
        for (let i = 1; i <= this.concurrentTests; i++) {
            // jcl
            // sleep for 1 second
            await new Promise(resolve => setTimeout(resolve, 100));
            testPromises.push(this.runSingleTest(i));
        }

        // Wait for all tests to complete
        await Promise.all(testPromises);

        this.endTime = Date.now();
        this.logResults();
    }

    logResults() {
        const totalDuration = this.endTime - this.startTime;
        const successRate = ((this.concurrentTests - this.failedTests) / this.concurrentTests * 100).toFixed(2);

        this.log('\n📊 STRESS TEST RESULTS');
        this.log('='.repeat(80));
        this.log(`Total Tests: ${this.concurrentTests}`);
        this.log(`Successful: ${this.concurrentTests - this.failedTests}`);
        this.log(`Failed: ${this.failedTests}`);
        this.log(`Success Rate: ${successRate}%`);
        this.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)} seconds`);
        this.log(`Average per Test: ${(totalDuration / this.concurrentTests / 1000).toFixed(2)} seconds`);

        // Show failed tests details
        const failedTests = this.results.filter(r => !r.success);
        if (failedTests.length > 0) {
            this.log('\n❌ FAILED TESTS:');
            this.log('-'.repeat(40));
            failedTests.forEach(test => {
                this.log(`Test ${test.testId}: Exit code ${test.exitCode}`);
                if (test.error) {
                    this.log(`  Error: ${test.error}`);
                }
                if (test.stderr && test.stderr.trim()) {
                    this.log(`  Stderr: ${test.stderr.trim().substring(0, 200)}...`);
                }
            });
        }

        // Show timing statistics
        const durations = this.results.map(r => r.duration);
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

        this.log('\n⏱️ TIMING STATISTICS:');
        this.log('-'.repeat(40));
        this.log(`Fastest Test: ${(minDuration / 1000).toFixed(2)} seconds`);
        this.log(`Slowest Test: ${(maxDuration / 1000).toFixed(2)} seconds`);
        this.log(`Average Test: ${(avgDuration / 1000).toFixed(2)} seconds`);

        // Overall result
        this.log('\n' + '='.repeat(80));
        if (this.failedTests === 0) {
            this.log('🎉 ALL STRESS TESTS PASSED! Server handled concurrent load successfully.');
        } else {
            this.log(`⚠️  ${this.failedTests} out of ${this.concurrentTests} tests failed. Check server stability.`);
        }
        this.log('='.repeat(80));

        return this.failedTests === 0;
    }

    async cleanup() {
        this.log('🧹 Cleaning up running test processes...');

        // Kill any remaining processes
        for (const process of this.runningTests) {
            try {
                process.kill('SIGTERM');
                setTimeout(() => {
                    if (this.runningTests.has(process)) {
                        process.kill('SIGKILL');
                    }
                }, 2000);
            } catch (error) {
                this.log(`Error killing process: ${error.message}`);
            }
        }

        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Main execution
async function runStressTest() {
    // Parse command-line argument for number of tests
    const args = process.argv.slice(2);
    let numTests = 100; // Default value

    if (args.length > 0) {
        const parsed = parseInt(args[0], 10);
        if (isNaN(parsed) || parsed < 1) {
            console.error('❌ Error: Number of tests must be a positive integer');
            console.log('Usage: node stress-test.js [number_of_tests]');
            console.log('Example: node stress-test.js 50');
            process.exit(1);
        }
        numTests = parsed;
    }

    const runner = new StressTestRunner(numTests);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, cleaning up...');
        await runner.cleanup();
        process.exit(1);
    });

    process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, cleaning up...');
        await runner.cleanup();
        process.exit(1);
    });

    try {
        const success = await runner.runStressTest();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('💥 Stress test runner crashed:', error.message);
        await runner.cleanup();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runStressTest();
}

module.exports = { StressTestRunner, runStressTest };
