const rp = require('request-promise-native');
const Bottleneck = require('bottleneck');
const async = require('async');
const ProgressBar = require('progress');
const argv = require('yargs')
    // .usage('Usage: $0 -w [num] -h [num]')
    // .demandOption(['w','h'])
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
    }

    // How many different rate limits to test
    const limitsToTest = max - min + 1;
    console.log(limitsToTest, 'limits to test:', min, 'to', max, 'per time');
    async.timesLimit(limitsToTest, 1, (limitTestNum, nextTest) => {

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

        // Run a minute's worth of tests
        const totalRuns = testLimit * 10;
        var bar = new ProgressBar(`${testLimit} per time |:bar| :percent`, { 
            total: totalRuns,
            // clear: true
            width: 40,
        });

        // console.log(testLimit, 'per time:');
        async.timesLimit(totalRuns, 1, (runNum, nextRun) => {
            // console.log('run', runNum, 'for', testLimit, 'per time');
            limiter.schedule(() => rp(url, reqOptions))
                .then((result) => {
                    bar.tick();
                    // console.log(result.statusCode);
                    nextRun();
                })
                .catch((error) => {
                    nextRun(`\n${testLimit} per time failed (${error.statusCode})`);
                });
        }, (error) => { // Do this when finished or failed
            if (error) { 
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

testRateLimit();