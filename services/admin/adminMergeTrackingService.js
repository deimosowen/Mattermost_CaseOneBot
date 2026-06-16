const {
    getFeaturesWithOpenMRs,
    deleteFeatureReady,
    addFeatureReady,
    addFeatureMergeRequest,
    deleteFeatureMergeRequestById,
} = require('../../db/models/featureReady');
const {
    getProjectByName,
    addMergeRequest,
    getMergeRequestById,
    deleteMergeRequestById,
} = require('../../db/models/gitlab');
const { deleteReviewTasksByGitlabMergeRequestId } = require('../../db/models/reviewTask');
const { parseGitlabMrUrl } = require('../gitlabService/gitlabHelper');
const GitlabService = require('../gitlabService');
const { GITLAB_BASE_URL } = require('../../config');

function getMergeTrackingPageData() {
    return {
        gitlabBaseUrl: GITLAB_BASE_URL || '',
    };
}

function parseMergeTasks(mergeTasks) {
    if (!mergeTasks) {
        return null;
    }
    const values = String(mergeTasks).split(/[,\s;]+/).filter(Boolean);
    return values.length ? values : null;
}

function buildFeatureMap(rows) {
    const featuresMap = new Map();

    for (const row of rows) {
        if (!featuresMap.has(row.id)) {
            featuresMap.set(row.id, {
                id: row.id,
                task_id: row.task_id,
                task_name: row.task_name,
                description: row.description,
                merge_tasks: row.merge_tasks ? JSON.parse(row.merge_tasks) : [],
                mattermost_post_id: row.mattermost_post_id,
                created_at: row.created_at,
                mrs: [],
            });
        }

        featuresMap.get(row.id).mrs.push({
            feature_merge_request_id: row.feature_merge_request_id,
            merge_request_id: row.merge_request_id,
            mr_iid: row.mr_iid,
            project_id: row.project_id,
            project_name: row.project_name || null,
            role: row.role,
            mr_status: row.mr_status,
            has_conflicts: !!row.has_conflicts,
            conflict_announced: !!row.conflict_announced,
        });
    }

    return Array.from(featuresMap.values());
}

async function getMergeTrackingFeatures() {
    const rows = await getFeaturesWithOpenMRs();
    return buildFeatureMap(rows);
}

async function removeFeature(id) {
    await deleteFeatureReady(parseInt(id, 10));
}

async function removeFeatureMergeRequest(id) {
    const mergeRequestId = await deleteFeatureMergeRequestById(parseInt(id, 10));
    if (!mergeRequestId) {
        const error = new Error('MR не найден');
        error.statusCode = 404;
        throw error;
    }

    await deleteReviewTasksByGitlabMergeRequestId(mergeRequestId);
    await deleteMergeRequestById(mergeRequestId);
}

async function resolveProject(projectName) {
    let project = await getProjectByName(projectName);
    if (project) {
        return project;
    }

    project = await GitlabService.getProjectByName(projectName);
    if (!project) {
        const error = new Error(`Проект "${projectName}" не найден`);
        error.statusCode = 400;
        throw error;
    }

    return project;
}

async function addMergeRequestToFeature(data) {
    if (!data.featureId || !data.url || !data.role) {
        const error = new Error('Не указан featureId, url или role');
        error.statusCode = 400;
        throw error;
    }

    const parsed = parseGitlabMrUrl(data.url);
    if (!parsed) {
        const error = new Error('Не удалось распарсить URL MR');
        error.statusCode = 400;
        throw error;
    }

    const project = await resolveProject(parsed.project);
    const existing = await getMergeRequestById(project.project_id, parsed.mrIid);
    const mergeRequestId = existing
        ? existing.id
        : await addMergeRequest({ project_id: project.project_id, mr_iid: parsed.mrIid, status: 'NEW' });

    await addFeatureMergeRequest(data.featureId, mergeRequestId, data.role);
}

function parseFeatureMergeRequests(data) {
    const mergeRequests = [
        { tag: '@c1-back', url: data.backPullRequestUrl },
        { tag: '@c1-front', url: data.frontPullRequestUrl },
        { tag: '@c1-aqa', url: data.aqaPullRequestUrl },
    ].filter((item) => item.url);

    return mergeRequests.map((item) => {
        const parsed = parseGitlabMrUrl(item.url);
        if (!parsed) {
            throw new Error(`Не удалось распарсить URL: ${item.url}`);
        }
        return { tag: item.tag, data: parsed, url: item.url };
    });
}

async function createFeature(data) {
    if (!data.taskId) {
        const error = new Error('Не указан taskId');
        error.statusCode = 400;
        throw error;
    }

    const parsedMrs = parseFeatureMergeRequests(data);
    const featureId = await addFeatureReady({
        taskId: data.taskId,
        taskName: data.taskName || null,
        description: data.description || null,
        mergeTaskId: parseMergeTasks(data.mergeTasks),
    }, parsedMrs, null);

    return featureId;
}

module.exports = {
    getMergeTrackingPageData,
    getMergeTrackingFeatures,
    removeFeature,
    removeFeatureMergeRequest,
    addMergeRequestToFeature,
    createFeature,
};
