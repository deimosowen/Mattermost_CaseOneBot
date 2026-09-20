const domainEventBus = require('../domainEventBus');
const flakyTriageService = require('./flakyTriageService');

let registered = false;

function register() {
    if (registered) {
        return;
    }

    domainEventBus.on('review.thread_ready', flakyTriageService.handleReviewThreadReady);
    domainEventBus.on('teamcity.build_finished', flakyTriageService.handleTeamCityBuildFinished);
    registered = true;
}

module.exports = {
    register,
    handleTriageResponse: flakyTriageService.handleTriageResponse,
    runManualCheckForMergeRequest: flakyTriageService.runManualCheckForMergeRequest,
};
