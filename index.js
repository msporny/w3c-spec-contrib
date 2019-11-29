const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const { Octokit } = require("@octokit/rest");
const dotenv = require('dotenv');

// read in .env configuration file
dotenv.config();

// constants
const token = process.env.GITHUB_TOKEN;
const owner = 'w3c'
const repo = '';
const tmpDir = path.join('tmp', 'w3c-spec-contrib', repo);
const commitsDir = path.join(tmpDir, 'commits');
const commitsFile = path.join(commitsDir, 'commits.json');
const commentsDir = path.join(tmpDir, 'comments');
const commentsFile = path.join(commentsDir, 'comments.json');
const issuesDir = path.join(tmpDir, 'issues');
const issuesFile = path.join(issuesDir, 'issues.json');
const usersDir = path.join(tmpDir, 'users');

// create directories
mkdirp.sync(tmpDir);
mkdirp.sync(issuesDir);
mkdirp.sync(commitsDir);
mkdirp.sync(commentsDir);
mkdirp.sync(usersDir);

// create client
const octokit = new Octokit({auth: token});

// get all commits for repo
(async () => {

  if(!fs.existsSync(issuesFile)) {
    console.log(`Fetching all issues for ${repo}...`);
    let issues = await octokit.paginate('GET /repos/:owner/:repo/issues?per_page=100&state=all', {owner, repo});
    fs.writeFileSync(issuesFile, JSON.stringify(issues, null, 2));
  }


  if(!fs.existsSync(commitsFile)) {
    console.log(`Fetching all commits for ${repo}...`);
    let commits = await octokit.paginate('GET /repos/:owner/:repo/commits', {owner, repo});
    fs.writeFileSync(commitsFile, JSON.stringify(commits, null, 2));
  }

  const commits = JSON.parse(fs.readFileSync(commitsFile));
  commits.forEach(async (item) => {
    const commitFile = path.join(commitsDir, item.sha);
    if(!fs.existsSync(commitFile)) {
      const commit_sha = item.sha;
      console.log(`Fetching commit ${commit_sha}...`);
      let commit = await octokit.git.getCommit({owner, repo, commit_sha});
      fs.writeFileSync(commitFile, JSON.stringify(commit, null, 2));
      //console.log("COMMIT", JSON.stringify(commit, null, 2));
    }
  });

  // fetch and cache all repository comments
  if(!fs.existsSync(commentsFile)) {
    console.log(`Fetching all comments for ${repo}...`);
    let comments = await octokit.paginate('GET /repos/:owner/:repo/issues/comments', {owner, repo});
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));
  }


  // calculate disposition of comments
  // const issues = JSON.parse(fs.readFileSync(issuesFile));
  // const dispositionOfComments = [];
  // issues.forEach(issue => {
  //   const {labels} = issue;
  //   labels.forEach(label => {
  //     if(label.name === 'cr-comment') {
  //       dispositionOfComments.push(issue);
  //     }
  //   });
  // });

  // display disposition of comments
  //console.log('url,number,title,commenter,disposition,state,comments,' +
  //  'created_at,closed_at');
  // dispositionOfComments.forEach(issue => {
  //   let {url, number, title, user: {login: commenter}, state, comments,
  //     created_at, closed_at} = issue;
  //   let disposition = 'UNKNOWN';
  //   const {labels} = issue;
  //   labels.forEach(label => {
  //     if(label.name.startsWith('cr-comment-')) {
  //       disposition = label.name;
  //     }
  //   });
  //   title = title.replace(',', '\,');
  //   console.log(`${url},${number},${title},${commenter},${disposition},` +
  //     `${state},${comments},${created_at},${closed_at}`);
  // });

  //process.exit();

  // calculate commentary
  const comments = JSON.parse(fs.readFileSync(commentsFile));
  const commentary = {};
  comments.forEach(comment => {
    if(commentary[comment.user.login] === undefined) {
      commentary[comment.user.login] = {
        comments: 0,
        commentBytes: 0
      };
    }
    if(comment.body.includes("View the transcript")) {
      return;
    }
    commentary[comment.user.login].comments += 1;
    commentary[comment.user.login].commentBytes += comment.body.length;
  });

  // gather the unsorted comments
  const sortedComments = [];
  Object.keys(commentary).forEach(key => {
    sortedComments.push({
      user: key,
      comments: commentary[key].comments,
      commentBytes: commentary[key].commentBytes,
      score: commentary[key].comments + Math.floor(commentary[key].commentBytes / 1024)
    });
  });

  // sort the comments
  sortedComments.sort((a, b) => {
    return b.score - a.score;
  });

  console.log(
    'user'.padStart(20, ' '), '|',
    'score'.padStart(6, ' '), '|',
    'comments'.padStart(10, ' '), '|',
    'bytes'.padStart(8, ' '), '|');
  console.log('---------------------------------------');
  sortedComments.forEach(item => {
    console.log(
      item.user.padStart(20, ' '), '|',
      item.score.toString().padStart(6, ' '), '|',
      item.comments.toString().padStart(10, ' '), '|',
      item.commentBytes.toString().padStart(8, ' '), '|');
  });
  console.log(sortedComments);


  const acknowledgements = [];
  Object.keys(commentary).forEach(async key => {
    const username = key;
    const userFile = path.join(usersDir, username);
    if(!fs.existsSync(userFile)) {
      console.log(`Fetching user ${username}...`);
      const user = await octokit.users.getByUsername({username});
      fs.writeFileSync(userFile, JSON.stringify(user.data, null, 2));
    }

    const user = JSON.parse(fs.readFileSync(userFile));
    //console.log("USER", user);
    acknowledgements.push(user.name || user.login);
  });

  acknowledgements.sort((a, b) => {
    const aName = a.split(' ');
    const bName = b.split(' ');
    const aLastName = aName[aName.length - 1];
    const bLastName = bName[bName.length - 1];
    if(aLastName < bLastName) return -1;
    if(aLastName > bLastName) return 1;
    return 0;
  });

  console.log(acknowledgements.join(',\n'));

})();
