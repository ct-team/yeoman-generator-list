var _ = require('lodash');
var Q = require('q');
var npmKeyword = require('npm-keyword');
var packageJson = require('package-json');
var ghGot = require('gh-got');

function createComponentData(npm, gh) {
  return {
    name: npm.name,
    description: npm.description || gh.description,
    owner: npm.author && npm.author.name || gh.owner.login,
    ownerWebsite: npm.author && npm.author.url || gh.owner.html_url,
    website: gh.html_url,
    stars: gh.stargazers_count,
    created: gh.created_at,
    updated: gh.updated_at
  };
}

function condenseMeta(pkg) {
  return {
    name: pkg.name,
    author: pkg.author ? pkg.author : '',
    gitURL: pkg.repository ? pkg.repository.url : '',
  };
}

function getNpmPackageList() {
  // TODO: there has to be a better way to combine cb interface with promises than this mess
  var d = Q.defer();
  var keyword = process.env.NPM_LIST_KEYWORD || 'yeoman-generator';

  npmKeyword(keyword, function (err, packages) {
    if (err) {
      d.reject(err);
      return;
    }

    d.resolve(packages);
  });

  return d.promise;
}

function getNpmPackages(list) {
  return Q.all(list.map(function (el) {
    var d = Q.defer();

    packageJson(el.name, function (err, pkg) {
      if (err) {
        d.reject(err);
        return;
      }

      d.resolve(condenseMeta(pkg));
    });

    return d.promise;
  }));
}

function getGithubStats(list) {
  // make sure we have a git URL
  return Q.all(list.map(function (el) {
    var d = Q.defer();
    var re = /github\.com\/([\w\-\.]+)\/([\w\-\.]+)/i;

    if (!el.gitURL) {
      console.log('getGithubStats:', 'No gitURL', el);
    }

    var parsedUrl = re.exec(el.gitURL && el.gitURL.replace(/\.git$/, ''));
    // only return components from github
    if (!parsedUrl) {
      d.resolve();
      return d.promise;
    }

    var user = parsedUrl[1];
    var repo = parsedUrl[2];

    ghGot('repos/' + user + '/' + repo, {
      headers: {
        'user-agent': 'https://github.com/yeoman/yeoman-generator-list'
      }
    }, function (err, data, res) {
      if (err) {
        if (err.code === 404) {
          // don't fail just because the repo doesnt exist
          // instead just return `undefined` and filter it out later
          d.resolve();
        } else {
          d.reject(new Error('GitHub fetch failed\n' + err + '\n' + data));
        }
      } else {
        d.resolve(createComponentData(el, data));
      }

      return d.promise;
    });

    return d.promise;
  }));
}

function filterInvalidValues(list) {
  // TODO: this is pretty ugly. find a better way.
  // filter out null values introduced in previous steps
  return Q.all(_.reject(list, function (val) {
    return val == null;
  }));
}

module.exports = function () {
  return Q.fcall(getNpmPackageList)
    .then(getNpmPackages)
    .then(getGithubStats)
    .then(filterInvalidValues);
}
