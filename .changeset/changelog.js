const {
  getInfo,
  getInfoFromPullRequest,
} = require("@changesets/get-github-info");
const { Octokit } = require("@octokit/rest");

const repo = "cloudmono666/testturborepo";

const getDependencyReleaseLine = async (changesets, dependenciesUpdated) => {
  if (dependenciesUpdated.length === 0) return "";

  const changesetLink = `- Updated dependencies [${(
    await Promise.all(
      changesets.map(async (cs) => {
        if (cs.commit) {
          let { links } = await getInfo({
            repo,
            commit: cs.commit,
          });
          return links.commit;
        }
      })
    )
  )
    .filter((_) => _)
    .join(", ")}]:`;

  const updatedDependenciesList = dependenciesUpdated.map(
    (dependency) => `  - ${dependency.name}@${dependency.newVersion}`
  );

  return [changesetLink, ...updatedDependenciesList].join("\n");
};

const getReleaseLine = async (changeset, type, options) => {
  let description = undefined;

  let prFromSummary;
  let commitFromSummary;
  let usersFromSummary = [];

  const replacedChangelog = changeset.summary
    .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(\d+)/im, (_, pr) => {
      let num = Number(pr);
      if (!isNaN(num)) prFromSummary = num;
      return "";
    })
    .replace(/^\s*commit:\s*([^\s]+)/im, (_, commit) => {
      commitFromSummary = commit;
      return "";
    })
    .replace(/^\s*(?:author|user):\s*@?([^\s]+)/gim, (_, user) => {
      usersFromSummary.push(user);
      return "";
    })
    .trim();

  console.log("prFromSummary", prFromSummary);
  console.log(JSON.stringify(changeset));
  console.log(JSON.stringify(type));
  console.log(JSON.stringify(options));

  if (typeof prFromSummary === "number") {
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    const { data: comments } = await octokit.rest.pulls.listReviewComments({
      owner: repo.split("/")[0],
      repo: repo.split("/")[1],
      pull_number: prFromSummary,
    });

    console.log(JSON.stringify(comments));

    for (const comment of comments.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA.getTime() - dateB.getTime();
    })) {
      if (comment.body.startsWith("!description")) {
        description = comment.body.replace("!description", "").trim();
      }
    }
  }

  const [firstLine, ...futureLines] = replacedChangelog
    .split("\n")
    .map((l) => l.trimRight());

  const links = await (async () => {
    if (prFromSummary !== undefined) {
      let { links } = await getInfoFromPullRequest({
        repo,
        pull: prFromSummary,
      });
      if (commitFromSummary) {
        links = {
          ...links,
          commit: `[\`${commitFromSummary}\`](https://github.com/${repo}/commit/${commitFromSummary})`,
        };
      }
      return links;
    }
    const commitToFetchFrom = commitFromSummary || changeset.commit;
    if (commitToFetchFrom) {
      let { links } = await getInfo({
        repo,
        commit: commitToFetchFrom,
      });
      return links;
    }
    return {
      commit: null,
      pull: null,
      user: null,
    };
  })();

  const users = usersFromSummary.length
    ? usersFromSummary
        .map(
          (userFromSummary) =>
            `[@${userFromSummary}](https://github.com/${userFromSummary})`
        )
        .join(", ")
    : links.user;

  const prefix = [
    links.pull === null ? "" : ` (${links.pull})`,
    users === null ? "" : ` by ${users}`,
  ].join("");

  return `\n\n- ${description ?? "not founddddddd"} ${firstLine}${prefix ? `${prefix} \n` : ""}\n${futureLines.map((l) => `  ${l}`).join("\n")}`;
};

const changelogFunctions = { getReleaseLine, getDependencyReleaseLine };
module.exports = changelogFunctions;
