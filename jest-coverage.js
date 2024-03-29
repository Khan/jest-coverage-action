#!/usr/bin/env node
// @flow

// $FlowFixMe: shhhhh
require('@babel/register'); // flow-uncovered-line

const path = require('path');
const fs = require('fs');
const execProm = require('actions-utils/exec-prom');
const sendReport = require('actions-utils/send-report');

const coveragePragma = '\n// @coverage-lint';

/*::
import type {Message} from 'actions-utils/send-report';
*/

const getIgnoredRanges = (path, contents) => {
    const lines = contents.split('\n');
    const ranges = [];
    const errors = [];
    let blockStart = null;
    lines.forEach((line, i) => {
        i = i + 1; // 1-indexed lines
        if (line.match(/^\s*\/\* jest-uncovered-block \*\//)) {
            blockStart = i;
        } else if (line.match(/^\s*\/\* end jest-uncovered-block \*\//)) {
            if (blockStart == null) {
                errors.push({
                    path,
                    message: 'Unmatched end jest-uncovered-block',
                    start: {line: i, column: 0},
                    end: {line: i, column: 0},
                    annotationLevel: 'failure',
                });
            } else {
                ranges.push([blockStart, i]);
                blockStart = null;
            }
        } else if (line.includes(`// jest-uncovered-line`)) {
            ranges.push(i);
        } else if (line.includes(`// jest-next-uncovered-line`)) {
            ranges.push(i + 1);
        }
    });
    return {ranges, errors};
};

// flow-next-uncovered-line
const lintProject = coverageData => {
    // const filesToLint = execSync(
    //     `grep -l -rF "${coveragePragma}" ${base} --exclude-dir=node_modules --exclude-dir=coverage --exclude-dir=npm-packages-offline-cache || true`,
    // )
    //     .toString('utf8')
    //     .split('\n')
    //     .filter(Boolean);

    // $FlowFixMe: its ok folks
    // const coverageData = require(`${__dirname}/../../coverage/coverage-final.json`);

    const messages = [];

    // flow-next-uncovered-line
    for (const file of Object.keys(coverageData)) {
        if (!fs.existsSync(file)) {
            continue;
        }
        const contents = fs.readFileSync(file, 'utf8');
        if (!contents.includes(coveragePragma)) {
            continue;
        }
        const data = coverageData[file]; // flow-uncovered-line

        // true = covered, false = uncovered, undefined = no info
        const lineStatuses = {};

        /* flow-uncovered-block */
        let lastLine = 1;
        Object.keys(data.statementMap).forEach(key => {
            const {start, end} = data.statementMap[key];
            lastLine = Math.max(lastLine, end.line);
            if (data.s[key] === 0) {
                for (let line = start.line; line <= end.line; line++) {
                    lineStatuses[line] = false;
                }
            } else {
                for (let line = start.line; line <= end.line; line++) {
                    lineStatuses[line] = true;
                }
            }
        });
        /* end flow-uncovered-block */

        // TODO: Figure out why so much is now not covered by flow and fix
        /* flow-uncovered-block */
        // Uncalled functions in their entirety are uncovered
        Object.keys(data.fnMap).forEach(key => {
            const {start, end} = data.fnMap[key].loc;
            if (data.f[key] === 0) {
                for (let line = start.line; line <= end.line; line++) {
                    lineStatuses[line] = false;
                }
            }
        });
        /* end flow-uncovered-block */

        const {ranges: ignoredRanges, errors} = getIgnoredRanges(file, contents);
        messages.push(...errors);

        /* flow-uncovered-block */
        const ignoredLines = {};
        ignoredRanges.forEach(range => {
            if (typeof range === 'number') {
                ignoredLines[range] = true;
            } else {
                const [start, end] = range;
                for (let line = start; line <= end; line++) {
                    ignoredLines[line] = true;
                }
            }
        });
        /* end flow-uncovered-block */

        const uncoveredBlocks = [];
        let currentBlock = null;
        for (let line = 1; line <= lastLine; line++) {
            // flow-next-uncovered-line
            if (lineStatuses[line] === false && ignoredLines[line] !== true) {
                if (currentBlock === null) {
                    currentBlock = [line, line];
                } else {
                    currentBlock[1] = line;
                }
            } else if (
                (lineStatuses[line] === true || ignoredLines[line] === true) && // flow-uncovered-line
                currentBlock !== null
            ) {
                uncoveredBlocks.push(currentBlock);
                currentBlock = null;
            }
        }
        if (currentBlock !== null) {
            uncoveredBlocks.push(currentBlock);
        }

        /* flow-uncovered-block */
        uncoveredBlocks.forEach(([start, end]) => {
            const singleLine = start === end;
            const message = `${
                singleLine ? `Line ${start} is` : `Lines ${start}-${end} are`
            } not covered by jest tests! If it's dead code, remove it.\nOtherwise, try to write a test for the use case that the code is fulfilling.\nTo silence this error, ${
                singleLine
                    ? 'use // jest-uncovered-line or // jest-next-uncovered-line'
                    : 'surround with /* jest-uncovered-block */ and /* end jest-uncovered-block */'
            }`;
            /* end flow-uncovered-block */
            messages.push({
                message,
                start: {line: start, column: 0}, // flow-uncovered-line
                end: {line: end, column: 0}, // flow-uncovered-line
                annotationLevel: 'failure',
                path: file,
            });
        });
    }
    return messages;
};

async function run() {
    const jestBin = process.env['INPUT_JEST-BIN'];
    const workingDirectory = process.env['INPUT_CUSTOM-WORKING-DIRECTORY'];
    const subtitle = process.env['INPUT_CHECK-RUN-SUBTITLE'];

    if (!jestBin) {
        console.error(
            `You need to have jest installed, and pass in the the jest binary via the variable 'jest-bin'.`,
        );
        process.exit(1);
        return;
    }
    const coverageDataPath = process.env['INPUT_COVERAGE-DATA-PATH'];
    if (!coverageDataPath) {
        console.error(
            `You need to pass in the the coverage data path via the variable 'coverage-data-path'.`,
        );
        process.exit(1);
        return;
    }
    await execProm(`${jestBin}  --silent --coverage`, {
        rejectOnError: false,
        cwd: workingDirectory || '.',
    });

    // $FlowFixMe: its ok folks
    const coverageData = require(path.resolve(coverageDataPath)); // flow-uncovered-line
    const messages = lintProject(coverageData); // flow-uncovered-line
    await sendReport(`Jest Coverage${subtitle ? ' - ' + subtitle : ''}`, messages);
}

// flow-next-uncovered-line
run().catch(err => {
    console.error(err); // flow-uncovered-line
    process.exit(1);
});
