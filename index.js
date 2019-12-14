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

function calcMedian(values) {
    if (values.length === 0) return 0;
  
    values.sort(function(a,b){
      return a-b;
    });
  
    var half = Math.floor(values.length / 2);
  
    if (values.length % 2) return values[half];
  
    return Math.round((values[half - 1] + values[half]) / 2.0);
}

function calcAverage(values) {
    if (values.length === 0) return 0;
  
    let average = values.reduce((a, b) => a + b) / values.length;
  
    return Math.round(average);
  }


// Test response time to figure out how many requests to send in a minute
function prepTest() {
    var speedtestTimings = [];
    async.timesLimit(10, 1, async function(prepNum){
        try {
            const speedtest = await rp(url, reqOptions);
            speedtestTimings.push(speedtest.timingPhases.total);
            // var speedtestTiming = 150; // Pretend it's 500 ms
            // console.log(speedtestTiming, 'ms per run');
        } catch (error) {
            console.error(error);
        }
    }, (error) => {
        if (error) console.error(error);
        const mediaTiming = calcMedian(speedtestTimings);
        const averageTiming = calcAverage(speedtestTimings);
        // console.log(speedtestTiming);
        console.log(mediaTiming, 'ms median per test');
        console.log(averageTiming, 'ms average per test');
        console.log('Pausing for 10 seconds before continuing …');
        setTimeout(() => {
            runTest(averageTiming);
        }, 10 * 1000);

    });
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