import { Command } from 'commander';
import * as utils from '../utils';
import fs from 'fs';
import * as dummyProver from '../dummy-prover';
import * as contract from '../contract';
import * as run from '../run/run';

function openLog(fileName) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    return fs.openSync(`${fileName}-${timestamp}.log`, 'w');
}

async function withServer(testSuite, timeout) {
    try {
        if (!(await dummyProver.status())) {
            await dummyProver.enable();
        }
    } catch (error) {
        console.error("Failed to check or enable dummy prover", error);
        process.exit(1); // Exit if cannot proceed
    }

    try {
        await utils.spawn('cargo build --bin zksync_server --release');
        await utils.spawn('cargo build --bin dummy_prover --release');
    } catch (error) {
        console.error("Failed to build necessary binaries", error);
        process.exit(1); // Exit if build fails
    }

    const serverLog = openLog('server');
    const server = utils.background(
        'cargo run --bin zksync_server --release',
        [0, serverLog, serverLog] // redirect stdout and stderr to server.log
    );
    await utils.sleep(1);

    const proverLog = openLog('dummy_prover');
    const prover = utils.background(
        'cargo run --bin dummy_prover --release dummy-prover-instance',
        [0, proverLog, proverLog] // redirect stdout and stderr to dummy_prover.log
    );
    await utils.sleep(10);

    // Setup timeout for tests
    const timer = setTimeout(() => {
        console.log('Timeout reached!');
        process.exit(1);
    }, timeout * 1000);
    timer.unref();

    process.on('SIGINT', () => {
        console.log('Interrupt received...');
        process.exit(130);
    });

    process.on('SIGTERM', () => {
        console.log('Being terminated...');
        process.exit(143);
    });

    // Handle process exit
    process.on('exit', (code) => {
        console.log('Termination started...');
        utils.sleepSync(5); // Ensure processes finish
        utils.allowFailSync(() => process.kill(-server.pid, 'SIGKILL'));
        utils.allowFailSync(() => process.kill(-prover.pid, 'SIGKILL'));
        utils.allowFailSync(() => clearTimeout(timer));
        if (code !== 0) {
            run.catLogs();
        }
        utils.sleepSync(5); // Final cleanup buffer
    });

    await testSuite();
    process.exit(0);
}

export async function all() {
    // Simplified for demonstration
    console.log("Running all test suites...");
    // Implement specific test functions similar to this pattern
}

// Simplified command setup for demonstration
const command = new Command('integration').description('zksync integration tests').alias('i');

command.command('all')
    .description('run all integration tests (no testkit)')
    .action(async () => {
        const timeout = 1800; // Example timeout
        await withServer(all, timeout);
    });

// Additional commands can be defined here

export { command };
