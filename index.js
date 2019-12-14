const rp = require('request-promise-native');
const Bottleneck = require('bottleneck');
const async = require('async');
const ProgressBar = require('progress');
const argv = require('yargs')
    .usage('Usage: node $0 --url=[URL] --max=[NUM] [OPTIONS]')
    .option({
        'u': {
            alias: 'url',
            describe: 'URL to test, best to be in quotation marks',
            demandOption: true,
        },
        'per': {
            describe: 'Set measurement basis',
            choices: ['second','minute'],    
        },
        't': {
            alias: 'test',
            describe: 'What to test and measure, defaults to persecond',
            choices: ['concurrent', 'persecond'],
        }
    })
    .describe('min', 'Minimum value for tests')
    .describe('max', 'Maximum value for tests')
    .describe('concurrent', 'Number of concurrent requests')
    .alias('h', 'help')
    .demandOption(['max'])
    .argv;

const url = argv.url;
const max = argv.max || 20;
const min = argv.min || max;
const reqOptions = {
    simple: true,
    resolveWithFullResponse: true,
    time: true,
}
let perTime;
let testSettings;
const perSecond = {
    seconds: 1,
    label: 'per second',
};
const perMinute = {
    seconds: 60,
    label: 'per minute',
}


switch (argv.per) {
    case 'second':
        perTime = perSecond;
        break;

    case 'minute':
        perTime = perMinute;
        break;
    
    default:
        perTime = perSecond;
        break;
}

prepTest();

// Test response time to figure out how many requests to send in a minute
async function prepTest() {
    try {
        const speedtest = await rp(url, reqOptions);
        var speedtestTiming = speedtest.timingPhases.total;
        // var speedtestTiming = 150; // Pretend it's 500 ms
        console.log(speedtestTiming, 'ms per run');
        runTest(speedtestTiming);
    } catch (error) {
        console.error(error);
    }
}


function runTest(speedtestTiming) {

    // How many different rate limits to test
    const limitsToTest = max - min + 1;

    console.log(limitsToTest, 'limits to test:', min, 'to', max, perTime.label);

    async.timesLimit(limitsToTest, 1, function(limitTestNum, nextTest) {

        // The limit to test
        testLimit = min + limitTestNum;

        if (argv.test == 'concurrent') {

            limiter = new Bottleneck({
                maxConcurrent: testLimit
            });

            timesPerSecond = speedtestTiming / 1000;
            // console.log(timesPerSecond);
            // if (timesPerSecond > max) timesPerSecond = max;
            // console.log(timesPerSecond);
            timesPerMinute = (60 / timesPerSecond) * testLimit;
            // console.log(timesPerMinute);

        } else if (argv.test == 'persecond') {
    
            limiter = new Bottleneck({
                reservoir: testLimit, // initial value
                reservoirRefreshAmount: testLimit,
                reservoirRefreshInterval: perTime.seconds * 1000, // must be divisible by 250
                maxConcurrent: argv.concurrent || 1,
            });

            timesPerSecond = (1000 / speedtestTiming);
            // console.log(timesPerSecond);
            if (timesPerSecond > testLimit) timesPerSecond = testLimit;
            // console.log(timesPerSecond);
            timesPerMinute = 60 * timesPerSecond;

        }

        // Run a minute's worth of tests
        const timesToRun = Math.round(timesPerMinute);
        console.log(testLimit, 'per time in', timesToRun, 'runs');
        var bar = new ProgressBar('|:bar| :percent :elapsed', { 
            total: timesToRun,
            // clear: true
            width: 40,
        });
        async.times(timesToRun, (runNum, nextRun) => {
            // console.log('run', runNum, 'for', testLimit, 'per time');
            limiter.schedule(() => rp(url, reqOptions))
                .then((result) => {
                    bar.tick();
                    // console.log(result.statusCode);
                    nextRun();
                })
                .catch((error) => {
                    console.error('1', error);
                    nextRun(`\n${testLimit} per time failed (${error.statusCode})`);
                });
        }, (error) => { // Do this when finished or failed
            if (error) {
                console.error('2', error);
                nextTest(error);
            } else {
                console.log('Success');
                nextTest();
            };
        });

    }, (error) => { // Do this when finished or failed
        if (error) console.log(error);
    });

}