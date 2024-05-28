const gulp = require('gulp');
const fs = require('node:fs');

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    let result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null) {
        result = [];
    }
    return result;
}
function getParamComments(func) {
    const fnStr = func
        .toString()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.trim());
    const comments = [];
    for (let i = 1; i < fnStr.length; i++) {
        if (fnStr[i].startsWith('//')) {
            comments.push(fnStr[i].trim().slice(2).trim());
        } else {
            break;
        }
    }

    const desc = [];
    for (let i = 0; i < comments.length; i++) {
        if (comments[i].startsWith('@')) {
            break;
        }
        desc.push(comments[i]);
    }
    const params = {};
    for (let i = 0; i < comments.length; i++) {
        if (comments[i].startsWith('@')) {
            const parts = comments[i].slice(7).trim().split(' ');
            params[parts[1]] = {
                type: parts[0].substring(1, parts[0].length - 1),
                desc: parts.slice(3).join(' ')
            };
        }
    }

    return { desc, params };
}

function replaceReadme(key, text) {
    const readme = fs.readFileSync('README.md', 'utf8');
    const lines = readme.split('\n');
    const result = [];
    let skip = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(key + '_START')) {
            skip = true;
            result.push(`<!-- ${key}_START -->`);
            result.push(text);
            result.push(`<!-- ${key}_END -->`);
        } else if (lines[i].includes(key + '_END')) {
            skip = false;
        } else if (!skip) {
            result.push(lines[i]);
        }
    }
    fs.writeFileSync('README.md', result.join('\n'));
}

function getCommands(Commands, index) {
    const commands = new Commands({ config: { thresholdValue: 1 } });
    const texts = [];
    const links = [];
    Object.keys(commands.commands).forEach(command => {
        const func = commands.commands[command];
        const params = getParamNames(func);
        params.shift();
        let text = `### <a name="${command.toLowerCase()}${index}"></a>${command}(${params.join(', ')})\n`;
        links.push(`* [${command}](#${command.toLowerCase()}${index})`); // #authenticateuser-pass-callback
        const comments = getParamComments(func);
        text += comments.desc.join('\n') + '\n';
        Object.keys(comments.params).forEach(param => {
            if (comments.params[param].desc) {
                text += `* ${param} *(${comments.params[param].type || 'any'})*: ${
                    comments.params[param].desc || '--'
                }\n`;
            } else {
                text += `* ${param}: '--'\n`;
            }
        });

        texts.push(text);
    });

    links.unshift('### List of commands');
    return links.concat(texts);
}

gulp.task('webList', done => {
    const SocketCommands = require('./lib/socketCommands');
    const texts = getCommands(SocketCommands, '_w');

    replaceReadme('WEB_METHODS', texts.join('\n'));
    done();
});

gulp.task('adminList', done => {
    const SocketCommands = require('./lib/socketCommandsAdmin');
    const texts = getCommands(SocketCommands, '_a');

    replaceReadme('ADMIN_METHODS', texts.join('\n'));
    done();
});
gulp.task('default', gulp.series('webList', 'adminList'));
