const rp = require('request-promise-native');
const Bottleneck = require('bottleneck');
const async = require('async');
const ProgressBar = require('progress');
const argv = require('yargs')
    .usage('Usage: node $0 --url=[URL] --max=[NUM] [OPTIONS]')
    .describe('url', 'URL to test, best to be in quotation marks')
    .describe('max', 'Maximum requests to run per time')
    .describe('min', 'Minimum requests to run per time')
    .describe('s', 'Set to requests to second [default]')
    .describe('m', 'Set to requests to minute')
    .alias('u', 'url')
    .alias('h', 'help')
    .demandOption(['url','max'])
    .argv;

function testRateLimit() {

    let secOrMin = 1; // Default to checking per second
    if (argv.s) secOrMin = 1;
    if (argv.m) secOrMin = 60;

    const url = argv.url;
    const max = argv.max || 20;
    const min = argv.min || max;
    const maxConcurrent = argv.concurrent || 1;
    const reqOptions = {
        simple: true,
        resolveWithFullResponse: true,
        time: true,
    }

    // How many different rate limits to test
    const limitsToTest = max - min + 1;
    console.log(limitsToTest, 'limits to test:', min, 'to', max, 'per time');
    async.timesLimit(limitsToTest, 1, function(limitTestNum, nextTest) {

        // The limit to test
        const testLimit = min + limitTestNum;

        const limiter = new Bottleneck({
            reservoir: testLimit, // initial value
            reservoirRefreshAmount: testLimit,
            reservoirRefreshInterval: secOrMin * 1000, // must be divisible by 250
            // also use maxConcurrent and/or minTime for safety
            maxConcurrent,
            // minTime: 333 // pick a value that makes sense for your use case
        });

        // Test response time to figure out how many requests to send in a minute
        rp(url, reqOptions)
            .then( (speedtest) => {
                var speedtestTiming = speedtest.timingPhases.total;
                timesPerSecond = (1000 / speedtestTiming);
                if (timesPerSecond > max) timesPerSecond = max;
            })
            .then( function() {
                // Run a minute's worth of tests
                const timesToRun = Math.round(testLimit * (60 * timesPerSecond));
                console.log(testLimit, 'per time in', timesToRun, 'runs');
                var bar = new ProgressBar('|:bar| :percent :elapsed', { 
                    total: timesToRun,
                    // clear: true
                    width: 40,
                });
                async.timesLimit(timesToRun, 1, (runNum, nextRun) => {
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
            })
            .catch((error) => {
                console.error(error);
            });


    }, (error) => { // Do this when finished or failed
        if (error) console.log(error);
    });

}    

testRateLimit();