// custom.js



'use strict';

$.datetimepicker.setDateFormatter('moment');
var connection = new Postmonger.Session();
var lastStepEnabled = false;
let userId = '';
let token;
let accountToken;
let accountId;
let projectId;
let campaignId;
let baseUrl;
let businessUnit = '';
let isInitialized = false;
let wasInitialized = false;
let config = {};

// Date picker vars
let minTime;

let inputStartDateTime;
let inputEndDateTime;

let endDate;
let endTime;

const DATE_FORMAT = 'DD-MM-YYYY';
const TIME_FORMAT = 'HH:mm';
const DATE_TIME_FORMAT = 'DD-MM-YYYY HH:mm';

let maxEndTime = moment().utc().add(12, 'hours').format(TIME_FORMAT);
let minEndTime = '23:59';

$(window).ready(onRender);

connection.on('initActivity', initialize);
connection.on('requestedTokens', onGetTokens);
connection.on('clickedNext', save);
connection.on('requestedEndpoints', onGetEndpoints);

function getOptimizeOnTimesArray() {
    if (inputStartDateTime && inputEndDateTime) {    
        const startDateTime = moment(inputStartDateTime, DATE_TIME_FORMAT).format(DATE_TIME_FORMAT);
        const endDateTime = moment(inputEndDateTime, DATE_TIME_FORMAT).format(DATE_TIME_FORMAT);
        if (startDateTime < endDateTime) {
            return getDatesBetweenDates();
        }
    }
    return [];
}

function getDatesBetweenDates() {
    const start = moment(inputStartDateTime, DATE_TIME_FORMAT).add(30, 'minutes');
    const end = moment(inputEndDateTime, DATE_TIME_FORMAT);
    const dates = [];
  
    while (
        start.isSameOrBefore(end, 'year') &&
        start.isSameOrBefore(end, 'month') &&
        start.isSameOrBefore(end, 'day') &&
        start.isSameOrBefore(end, 'minute')
    ) {
      const date = moment(start).utc().set({
        year: start.year(),
        month: start.month(),
        date: start.date(),
        hours: start.hours(),
        minutes: start.minutes(),
      });
      dates.push({
        utc_time_of_day: moment(date, DATE_TIME_FORMAT).format(TIME_FORMAT),
        named_day: moment(date, DATE_TIME_FORMAT).format('ddd'),
      });
      start.add(30, 'minutes');
    }
    return dates;
  }

function getOptimizationTimeOptions () {
    const start = moment().startOf('day');

    const times = 24 * 4; // 24 hours * 30 mins in an hour
    const timesArray = []
    for (let i = 0; i <= times; i++) {
      const time = moment(start)
        .add(15 * i, 'minutes')
        .format(TIME_FORMAT);
      timesArray.push(time);
    }
    return [...new Set(timesArray)];
  }

function onRender() {
    initStartDateTimePicker();
    initEndDateTimePicker();
    // JB will respond the first time 'ready' is called with 'initActivity'
    connection.trigger('ready');

    connection.trigger('requestEndpoints');

    // handle custom events
    $('#fetch-campaigns').on('click', fetchCampaignsList)
    $('#save-campaign-id').on('click', onCampaignSelect);
    $('#cancel-campaign').on('click', onCancelCampaign);
    $('#initialize-campaign').on('click', initializeCampaign);
    $('#businessUnit').on('input', function(e) {
        businessUnit = e.target.value;
        $('#business-unit').text(businessUnit);
        updateConfigArguments();
    })
}

function onCancelCampaign() {
    if (!isInitialized && !wasInitialized) {
        alert('The campaign has not been initialized');
        return false;
    }
    if (!campaignId || !businessUnit) {
        alert('Campaign or business unit id is not defined');
        return false;
    }
    updateStatusBar('Cancelling...');
    $.ajax({
        url: `https://connect-internal-qa.phrasee.co/v1/phraseex/campaigns/${campaignId}`,
        method: 'delete',
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        headers: {
            'Authorization': `Bearer ${accountToken}`
        },
        data: JSON.stringify({
            campaign_id: campaignId,
            client_id: businessUnit,
        }),
        success: function() {
            isInitialized = false;
            disableBtns();
            updateAlert(false);
            updateStatusBar('Campaign successfully canceled');
            deleteSfmcJsonData();
            alert('Campaign successfully canceled');
        },
        error: function(err) {
            updateStatusBar('Error cancelling campaign!!!');
            updateAlert(true);
            alert('Campaign cancel error');
        }
    });
}

function initializeCampaign() {
    if (!accountToken) {
        alert('Access token is required');
        return false;
    }
    if (!projectId) {
        alert('Project is not selected');
        return false;
    }
    if (!campaignId) {
        alert('Campaign is not selected');
        return false;
    }
    if (!inputStartDateTime) {
        alert('Optimization start date time is not selected');
        return false;
    }
    if (!inputEndDateTime) {
        alert('Optimization end date time is not selected');
        return false;
    }

    const optimizationStart = moment(inputStartDateTime, DATE_TIME_FORMAT).utc().set({
        year: moment(inputStartDateTime, DATE_TIME_FORMAT).year(),
        month: moment(inputStartDateTime, DATE_TIME_FORMAT).month(),
        date: moment(inputStartDateTime, DATE_TIME_FORMAT).date(),
        hours: moment(inputStartDateTime, DATE_TIME_FORMAT).hours(),
        minutes: moment(inputStartDateTime, DATE_TIME_FORMAT).minutes(),
    });
    const optimizationEnd = moment(inputEndDateTime, DATE_TIME_FORMAT).utc().set({
        year: moment(inputEndDateTime, DATE_TIME_FORMAT).year(),
        month: moment(inputEndDateTime, DATE_TIME_FORMAT).month(),
        date: moment(inputEndDateTime, DATE_TIME_FORMAT).date(),
        hours: moment(inputEndDateTime, DATE_TIME_FORMAT).hours(),
        minutes: moment(inputEndDateTime, DATE_TIME_FORMAT).minutes(),
    });
    if (optimizationStart.format() >= optimizationEnd.format()) {
        alert('End time should be greater than start time');
        return false;
    }
    if (!businessUnit) {
        alert('Business unit id is required');
        return false;
    }
    const data = {
        allow_control_drop: false,
        audience_size: 10,
        distribution_type: "batched_trigger",
        drop_bad_variants: false,
        enable_realtime_api: false,
        interval_type: "minutes",
        interval_value: 10,
        optimization_mode: "single_best",
        optimization_settings: { mode: "single_best" },
        performance_metric: "opens-to-sends",
        pool_size: 3,
        schedules: getOptimizeOnTimesArray(),
        campaign_id: campaignId,
        client_id: businessUnit,
        campaign_start_time: optimizationStart.format(),
        optimization_start_time: optimizationStart.format(),
        optimization_end_time: optimizationEnd.format(),
        campaign_end_time: optimizationEnd.format(),
        use_dispatcher: true,
        create_assets: wasInitialized
    }

    $.ajax({
        url: `https://connect-internal-qa.phrasee.co/v1/phraseex/campaigns/${campaignId}`,
        method: (isInitialized || wasInitialized) ? 'put' : 'post',
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        headers: {
            'Authorization': `Bearer ${accountToken}`
        },
        data: JSON.stringify(data),
        success: function(response) {
            isInitialized = true;
            wasInitialized = true;
            updateAlert(false);
            updateStatusBar(`Campaign successfully ${wasInitialized ? 'updated' : 'initialized'}!!!`);
            alert('Campaign successfully initialized');
            save();
        },
        error: function(err) {
            updateStatusBar('Error initializing campaign!!!');
            updateAlert(true);
            alert('Campaign initialize error');
        }
    });
}

function initStartDateTimePicker() {
    $('#datetimepickerStart').datetimepicker({
        format: DATE_TIME_FORMAT,
        formatTime: TIME_FORMAT,
        formatDate: DATE_FORMAT,
        onChangeDateTime: function(dp,$input){
            inputStartDateTime = moment($input.val(), DATE_TIME_FORMAT).format(DATE_TIME_FORMAT);
            minTime = moment($input.val(), DATE_TIME_FORMAT).format(DATE_FORMAT) === moment().format(DATE_FORMAT)
                ? moment().utc().format(TIME_FORMAT)
                : '00:00';
            initStartDateTimePicker();
            initEndDateTimePicker();
            $('#start-date-time-id').text(inputStartDateTime);
            updateConfigArguments();
        },
        minDate: moment().utc().format(DATE_FORMAT),
        minTime,
        allowTimes: getOptimizationTimeOptions(),
    });
}

function initEndDateTimePicker() {
    $('#datetimepickerEnd').datetimepicker({
        format: DATE_TIME_FORMAT,
        formatTime: TIME_FORMAT,
        formatDate: DATE_FORMAT,
        onChangeDateTime: function(dp,$input){
            inputEndDateTime = moment($input.val(), DATE_TIME_FORMAT).format(DATE_TIME_FORMAT);
            minEndTime = moment(inputStartDateTime, DATE_TIME_FORMAT).add(12, 'hours').format(DATE_FORMAT) === moment(inputEndDateTime, DATE_TIME_FORMAT).format(DATE_FORMAT)
            ? moment().startOf('day').format(TIME_FORMAT)
            : moment(inputStartDateTime, DATE_TIME_FORMAT).format(TIME_FORMAT);
            maxEndTime = moment(inputStartDateTime, DATE_TIME_FORMAT).add(12, 'hours').format(DATE_FORMAT) === moment(inputEndDateTime, DATE_TIME_FORMAT).format(DATE_FORMAT)
            ? moment(inputStartDateTime, DATE_TIME_FORMAT).add(12, 'hours').format(TIME_FORMAT)
            : moment().endOf('day').format(TIME_FORMAT);
            initEndDateTimePicker();
            $('#end-date-time-id').text(inputEndDateTime);
            updateConfigArguments();
        },
        minDate: moment(inputStartDateTime, DATE_TIME_FORMAT).format(DATE_FORMAT),
        maxDate: moment(inputStartDateTime, DATE_TIME_FORMAT).add(12, 'hours').format(DATE_FORMAT),
        minTime: minEndTime,
        maxTime: maxEndTime,
        allowTimes: getOptimizationTimeOptions()
    });
}

function initialize (data) {
    config = data;
    isInitialized = data.metaData.isConfigured || false;
    disableBtns();
    if (
        data &&
        data.arguments &&
        data.arguments.execute &&
        data.arguments.execute.inArguments &&
        data.arguments.execute.inArguments.length
    ) {
        const accountTokenObj = data.arguments.execute.inArguments.find(item => !!item.accountToken );
        const accountIdObj = data.arguments.execute.inArguments.find(item => !!item.accountId );
        const projectIdObj = data.arguments.execute.inArguments.find(item => !!item.projectId );
        const campaignIdObj = data.arguments.execute.inArguments.find(item => !!item.campaignId );
        const businessUnitObj = data.arguments.execute.inArguments.find(item => !!item.businessUnit );
        const inputStartDateTimeObj = data.arguments.execute.inArguments.find(item => !!item.startDateTime );
        const inputEndDateTimeObj = data.arguments.execute.inArguments.find(item => !!item.endDateTime );

        accountToken = accountTokenObj ? accountTokenObj.accountToken : '';
        accountId = accountIdObj ? accountIdObj.accountId : '';
        projectId = projectIdObj ? projectIdObj.projectId : '';
        campaignId = campaignIdObj ? campaignIdObj.campaignId : '';
        businessUnit = businessUnitObj ? businessUnitObj.businessUnit : '';
        inputStartDateTime = inputStartDateTimeObj ? inputStartDateTimeObj.startDateTime : '';
        inputEndDateTime = inputEndDateTimeObj ? inputEndDateTimeObj.endDateTime : '';

        updateConfigArguments();
        if (projectId &&
            accountToken &&
            accountId &&
            campaignId &&
            businessUnit &&
            !inputStartDateTime &&
            !inputEndDateTime) {
            wasInitialized = true;
        }
        $('#projects-list').val(projectId);
        $('#campaigns-list').val(campaignId);
        $('#datetimepickerStart').val(inputStartDateTime);
        $('#datetimepickerEnd').val(inputEndDateTime);
        $('#businessUnit').val(businessUnit);
        if (projectId && campaignId && accountId && accountToken) {
            fetchProjectsList();
            fetchCampaignsList();
        }
    }
}

function onGetTokens (tokens) {
    token = tokens.fuel2token;
    $('#fuel2token').text(token);
    updateStatusBar(`Got token: ${token}. Getting account token...`);
    updateAlert(false);
    getAccountToken();
}

function onGetEndpoints (endpoints) {
    baseUrl = endpoints.fuelapiRestHost;
    // got the base url, now request the endpoints
    connection.trigger('requestTokens');
}

function onCampaignSelect() {
    campaignId = $('#campaigns-list').val();
    if (!campaignId) {
        alert('Please select a campaign first');
        return false;
    }
    // some validation checks here
    if (!accountId) {
        alert('Account id is missing');
        return false;
    }
    if (!accountToken) {
        alert('Account token is missing');
        return false;
    }
    if (!projectId) {
        alert('Project id is missing');
        return false;
    }
    // update dynamic variables in the config
    updateConfigArguments();
}

function updateConfigArguments(isConfigured) {
    config.arguments.execute.inArguments = [
        {'accountId': accountId},
        {'accountToken': accountToken},
        {'projectId': projectId || ''},
        {'campaignId': campaignId || ''},
        {'businessUnit': businessUnit || ''},
        {'startDateTime': inputStartDateTime || ''},
        {'endDateTime': inputEndDateTime || ''},
    ];
    if (isConfigured) {
        config['metaData'].isConfigured = true;
    }
    $('#account-token').text(accountToken);
    $('#account-id').text(accountId);
    $('#start-date-time-id').text(inputStartDateTime);
    $('#datetimepickerStart').val(inputStartDateTime);
    $('#end-date-time-id').text(inputEndDateTime);
    $('#datetimepickerEnd').val(inputEndDateTime);
    $('#business-unit').text(businessUnit);
    $('#businessUnit').val(businessUnit);
    $('#campaign-id').text(campaignId);
    $('#project-id').text(projectId);
    $('#account-id').text(accountId);
}

function save() {
    if (!isInitialized && !wasInitialized) {
       const confirmAnswer = confirm('The campaign has not been initialized, are you sure want to continue?');
       if (confirmAnswer) {
           connection.trigger('destroy');
       } else {
           connection.trigger('prevStep');
       }
    }
    if (isInitialized || wasInitialized) {   
        // some validation checks here
        if (!accountId) {
            alert('Account id is missing');
            return false;
        }
        if (!accountToken) {
            alert('Account token is missing');
            return false;
        }
        if (!projectId) {
            alert('Project id is missing');
            return false;
        }
        if (!campaignId) {
            alert('Campaign id is missing');
            return false;
        }
        if (!businessUnit) {
            alert('Business unit id is missing');
            return false;
        }
        if (!inputStartDateTime) {
            alert('Start date time is missing');
            return false;
        }
        if (!inputEndDateTime) {
            alert('End date time is missing');
            return false;
        }
        config.metaData.isConfigured = true;
        connection.trigger("updateActivity", config);
    }
}

function deleteSfmcJsonData() {
    config.metaData.isConfigured = false;
    config.arguments.execute.inArguments = [
        {'accountId': accountId},
        {'accountToken': accountToken},
        {'projectId': projectId || ''},
        {'campaignId': campaignId || ''},
        {'businessUnit': businessUnit || ''}
    ];
    connection.trigger("updateActivity", config);
}

function updateStatusBar(message) {
    $('#statusbar').text(message);
}

function updateAlert(isError) {
    if (isError) {
        $('#alert').removeClass("alert-success");
        $('#alert').addClass("alert-danger");
    } else {
        $('#alert').removeClass("alert-danger");
        $('#alert').addClass("alert-success");
    }
}

function getAccountToken() {
    if (!token) {
        alert('Fuel2Token is required');
        return false;
    }
    $.ajax({
        url: 'https://busboy-qa.phrasee.co/auth/journey-builder/get-account-token',
        method: 'post',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        data: {
            base_url: 'https://www-mc-s10.exacttargetapis.com/',
        },
        success: function(response) {
            updateStatusBar('Success for getting account token. Getting list of projects now...');
            updateAlert(false);
            accountToken = response.data.accountToken;
            accountId = response.data.accountId;
            updateConfigArguments();
            fetchProjectsList();
        },
        error: function(err) {
            updateStatusBar('Error in getting account token');
            updateAlert(true);
        }
    })
}

function disableBtns() {
    $('#cancel-campaign').attr('disabled', (!isInitialized || wasInitialized));
    $('#projects-list').attr('disabled', isInitialized);
    $('#fetch-campaigns').attr('disabled', isInitialized);
    $('#campaigns-list').attr('disabled', isInitialized);
    $('#save-campaign-id').attr('disabled', isInitialized);
    $('#datetimepickerStart').attr('disabled', isInitialized);
    $('#datetimepickerEnd').attr('disabled', isInitialized);
    $('#businessUnit').attr('disabled', isInitialized);
    $('#initialize-campaign').attr('disabled', isInitialized);
}

function fetchProjectsList() {
    if (!accountToken) {
        alert('Account token is required');
        return false;
    }

    if (!accountId) {
        alert('AccountId is required');
        return false;
    }

    $.ajax({
        url: `https://connect-qa.phrasee.co/v2/accounts/${accountId}/projects?allChildren=false`,
        method: 'get',
        headers: { 
            'Authorization': `Bearer ${accountToken}`
        },
        success: function(response) {
            const projects = response;
            let optionsString = '<option value="">Select project</option>';
            projects.forEach( project => {
                optionsString += `<option value="${project.project_id}">${project.name}</option>`;
            });
            $('#projects-list').html(optionsString);
            if (projectId) {
                $('#projects-list').val(projectId);
            }
            updateStatusBar('Fetched projects, select a project.');
            updateAlert(false);
        },
        error: function(err) {
            updateStatusBar('Error in fetching projects list!!!');
            updateAlert(true);
        }
    })
}

function fetchCampaignsList(){
    if (!accountToken) {
        alert('Account token is required');
        return false;
    }
    if (!projectId) {
        projectId = $('#projects-list').val();
    }
    updateConfigArguments();
    if (!projectId) {
        alert('Please select a project');
        return false;
    }

    $.ajax({
        method: 'get',
        url: `https://connect-qa.phrasee.co/v2/projects/${projectId}/campaigns?completedCampaigns=completed`,
        headers: { 
            'Authorization': `Bearer ${accountToken}`
        },
        success: function(response) {
            const campaigns = response;
            let optionsString = '<option value="">Select campaign</option>';
            campaigns.forEach(function(campaign){
                optionsString += `<option value="${campaign.campaign_id}">${campaign.name}</option>`;
            });
            $('#campaigns-list').html(optionsString);
            if (campaignId) {
                $('#campaigns-list').val(campaignId);
            }
            updateStatusBar('Campaigns fetched. Select campaign and save.');
            updateAlert(false);
        },
        error: function(err) {
            updateStatusBar('Fetching campaigns failed!!!');
            updateAlert(true);
        }
    });
}
