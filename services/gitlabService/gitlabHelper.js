/**
 * Парсит GitLab URL и возвращает проект и IID MR
 * @param {string} url - ссылка на Merge Request
 * @returns {{ project: string, mrIid: number } | null}
 */
function parseGitlabMrUrl(url) {
    if (!url) {
        return null;
    }

    const regex = /\/([^/]+)\/-\/merge_requests\/(\d+)$/;
    const match = url.match(regex);

    if (!match) {
        return null;
    }

    return {
        project: match[1],
        mrIid: parseInt(match[2], 10),
    };
}

module.exports = {
    parseGitlabMrUrl
};