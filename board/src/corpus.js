// Commands the race can quiz, grouped by tool. Session-gated so a race only
// shows commands taught up to that point (inventory: slides repo, up to CI/CD 3).
export const CORPUS = {
  linux: [
    'ls -l', 'cd ..', 'pwd', 'cat file.txt', 'mkdir build', 'touch app.js',
    'cp a.txt b.txt', 'mv old new', 'rm -f tmp', 'chmod +x run.sh', 'grep -r TODO',
    'ps aux', 'kill -9 123', 'curl -sS localhost', 'ssh ec2-user@host', 'tail -f log',
  ],
  git: [
    'git init', 'git status', 'git add .', 'git commit -m "wip"', 'git push',
    'git pull', 'git switch main', 'git checkout -b feat', 'git merge dev', 'git log --oneline',
  ],
  gh: [
    'gh repo fork', 'gh repo sync', 'gh pr create', 'gh pr merge', 'gh secret set SHIPIT_TOKEN',
    'gh variable set BOARD_URL', 'gh secret list', 'gh workflow view',
  ],
  docker: [
    'docker build -t app .', 'docker run -d -p 3000:3000 app', 'docker ps -a', 'docker pull nginx',
    'docker logs -f app', 'docker exec -it app sh', 'docker stop app', 'docker push app', 'docker compose up -d',
  ],
  aws: [
    'aws configure', 'aws sts get-caller-identity', 'aws s3 ls', 'aws s3 cp f s3://b',
    'aws ec2 describe-instances', 'aws ssm start-session', 'aws ecr get-login-password',
  ],
};

// Which tool pools are unlocked by (i.e. taught by) a given session.
export const SESSIONS = {
  cicd3: ['linux', 'git', 'gh', 'docker', 'aws'],
  cicd4: ['linux', 'git', 'gh', 'docker', 'aws'],
};

export function pool(session) {
  const tools = SESSIONS[session] || [];
  return tools.flatMap((k) => CORPUS[k] || []);
}

export function pickPrompts(session, n = 12, rand = Math.random) {
  const avail = [...pool(session)];
  const picked = [];
  while (picked.length < n && avail.length) {
    const i = Math.floor(rand() * avail.length);
    picked.push(avail.splice(i, 1)[0]);
  }
  return picked;
}
