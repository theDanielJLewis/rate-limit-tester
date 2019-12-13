# Progressive Rate-Limit Tester

Test or discover the rate limit of any URL with this Node.js script! It will let you test a custom number of requsts per second (default) or per minute starting at an optional minimum to a the maximum, testing each limit for about a minute.

For example, if a URL is rate-limited to 2 requests per second, and you enter a minimum of 1 and maximum of 5, the test will step through as follows.

- 1 request per second for about a minute
- 2 requests per second for about a minute
- Fail during a test sending 3 requests per second

## Installation

You must have Node.js already installed.

```
git clone https://github.com/theDanielJLewis/rate-limit-tester.git
cd rate-limit-tester
npm i
```

## Usage

`node index.js --url=[URL] --max=[NUM] [OPTIONS]`

### Options

```
  --version   Show version number                                      [boolean]
  --max       Maximum requests to run per time                        [required]
  --min       Minimum requests to run per time
  -s          Set to requests to second [default]
  -m          Set to requests to minute
  -u, --url   URL to test, best to be in quotation marks              [required]
  -h, --help  Show help                                                [boolean]
```