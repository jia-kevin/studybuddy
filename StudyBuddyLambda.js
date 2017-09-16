/**
 * Study Buddy
 * Alexa skill that quizzes you and gives live feedback, emplying adaptive learning
 *
 * Hack the North 2017
 * Kevin Jia, Judy Liu, Kevin Zhang
 **/
'use strict';

const request = require('request');

const BASE_URL = 'https://api.quizlet.com/2.0/sets/';
const CLIENT_ID = 'uxKHy2Hg57';

const lessons = {
    'War of 1812' : 224423253,
    'Ancient Greeks' : 224423901,
    'World War Two' : 224423253,
    'Anatomy of a Cell' : 224426220,
    'Multiplication Tables' : 224427231,
    'Geometry' : 224427531
};

// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: 'PlainText',
            text: output,
        },
        card: {
            type: 'Simple',
            title: `SessionSpeechlet - ${title}`,
            content: `SessionSpeechlet - ${output}`,
        },
        reprompt: {
            outputSpeech: {
                type: 'PlainText',
                text: repromptText,
            },
        },
        shouldEndSession,
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: '1.0',
        sessionAttributes,
        response: speechletResponse,
    };
}

/**
* Scrambles quiz question order using Fisher-Yates Shuffle
*/
function randomizeOrder(quiz) {
    var max = quiz.length;
    for (var i = max - 1; i > 0; i--) {
        var index = Math.floor(Math.random()*(i+1));
        var temp = quiz[index];
        quiz[index] = quiz[i];
        quiz[i] = temp;
    }
    return quiz;
}


// --------------- Network Utilities -----------------------

/**
* Retrieves a quiz from Quizlet based on id
* Returns callback with JSON array 
*/
function getQuiz(id, callback) {
    var url = BASE_URL + id + '/terms?client_id=' + CLIENT_ID;
    request({url: url, encoding: null}, function(error, response, body) {
        if (error) {
            throw error;
        }
        callback(JSON.parse(body.toString()));
    });
}


// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    const sessionAttributes = {};
    const cardTitle = 'Welcome';
    const speechOutput = 'Welcome to the Study Buddy' +
        'Please pick a category that you would wish to study from.';
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    const repromptText = 'Please pick a category'
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function handleSessionEndRequest(callback) {
    const cardTitle = 'Session Ended';
    const speechOutput = 'Thank you for trying the Alexa Skills Kit sample. Have a nice day!';
    // Setting this to true ends the session and exits the skill.
    const shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}

function createFavoriteColorAttributes(favoriteColor) {
    return {
        favoriteColor,
    };
}

/**
 * Sets the color in the session and prepares the speech to reply to the user.
 */
function setColorInSession(intent, session, callback) {
    const cardTitle = intent.name;
    const favoriteColorSlot = intent.slots.Color;
    let repromptText = '';
    let sessionAttributes = {};
    const shouldEndSession = false;
    let speechOutput = '';

    if (favoriteColorSlot) {
        const favoriteColor = favoriteColorSlot.value;
        sessionAttributes = createFavoriteColorAttributes(favoriteColor);
        speechOutput = `I now know your favorite color is ${favoriteColor}. You can ask me ` +
            "your favorite color by saying, what's my favorite color?";
        repromptText = "You can ask me your favorite color by saying, what's my favorite color?";
    } else {
        speechOutput = "I'm not sure what your favorite color is. Please try again.";
        repromptText = "I'm not sure what your favorite color is. You can tell me your " +
            'favorite color by saying, my favorite color is red';
    }

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function getColorFromSession(intent, session, callback) {
    let favoriteColor;
    const repromptText = null;
    const sessionAttributes = {};
    let shouldEndSession = false;
    let speechOutput = '';

    if (session.attributes) {
        favoriteColor = session.attributes.favoriteColor;
    }

    if (favoriteColor) {
        speechOutput = `Your favorite color is ${favoriteColor}. Goodbye.`;
        shouldEndSession = true;
    } else {
        speechOutput = "I'm not sure what your favorite color is, you can say, my favorite color " +
            ' is red';
    }

    // Setting repromptText to null signifies that we do not want to reprompt the user.
    // If the user does not respond or says something that is not understood, the session
    // will end.
    callback(sessionAttributes,
        buildSpeechletResponse(intent.name, speechOutput, repromptText, shouldEndSession));
}


function repeatQuestion (intent, session, callback) {
  const repromptText = null;
  const sessionAttributes = {};
  let shouldEndSession = false;
  let speechOutput = '';

  //need to recall the current question and feed into speechOutput

  callback(sessionAttributes,
    buildSpeechletResponse(intent.name, speechOutput, repromptText, shouldEndSession));

}

function skipQuestion (intent, session, callback) {
  let question = session.attributes.question;
  const repromptText = null;
  const sessionAttributes = {};
  let shouldEndSession = false;
  let speechOutput = '';

  if (session.attributes) {
    session.attributes['question'] = question++;
  }

  //call the current question and feed string into speechOutput

  callback(sessionAttributes,
    buildSpeechletResponse(intent.name, speechOutput, repromptText, shouldEndSession));
}

// --------------- Events -----------------------

function categorySelect(intent, session, callback) {
    const sessionAttributes = {
        "category" : intent.slots.category,
        "quizId" : null,
        "quiz" : null,
        "question" : null,
        "correct" : null,
        "incorrect" : null
    };

    let quizOptions = [];

    if (intent.slots.category === 'history') {
        quizOptions = ['war of eighteen twelve', 'ancient greeks', 'world war two'];
    } else if (intent.slots.category === 'hcience') {
        quizOptions = ['anatomy of a cell', 'taxonomy'];
    } else if (intent.slots.category === 'math') {
        quizOptions = ['multiplication terms', 'geometry terms'];
    }

    const cardTitle = 'Quiz Select';
    var speechOutput = intent.slots.category + ' category selected.' +
        'Please select a quiz. Options are ';
    for (var i=0; i<quizOptions.length; i++) {
        speechOutput += quizOptions[i] + ', ';
    }
    speechOutput[speechOutput.length - 2] = '.'
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    const repromptText = 'Please select a quiz. Options are ';
    for (var i=0; i<quizOptions.length; i++) {
        repromptText += quizOptions[i] + ', ';
    }
    repromptText[repromptText.length - 2] = '.'
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
} 

function quizSelect(intent, session, callback) {
    var sessionAttributes = session.attributes;
    sessionAttributes['quizId'] = lessons[intentRequest.slots.quiz]
    getQuiz(lessons[intentRequest.slots.quiz], function(response) {
        sessionAttributes['quiz'] = response;
    });

    sessionAttributes['question'] = 0;
    sessionAttributes['correct'] = 0;
    sessionAttributes['incorrect'] = 0;

    var speechOutput = sessionAttributes['quiz'][sessionAttributes['question']][definition];
    var repromptText = sessionAttributes['quiz'][sessionAttributes['question']][definition];

    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function endQuiz(intent, session, callback) {
    var sessionAttributes = session.attributes;
    sessionAttributes['quiz'] = null;

    var speechOutput = '';
    if (sessionAttributes['correct'] + sessionAttributes['incorrect'] != 0) {
        speechOutput += 'Great study session. Your stats are ' + sessionAttributes['correct'] + ' correct and ' + sessionAttributes['incorrect'] + 
                        ' incorrect, for a correct rate of ' + (sessionAttributes['correct']*1.0/(sessionAttributes['incorrect'])) + ' percent. ';
    }

    speechOutput += 'Please pick a category that you would wish to study from.';
    const repromptText = 'Please pick a category'
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log(`onSessionStarted requestId=${sessionStartedRequest.requestId}, sessionId=${session.sessionId}`);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log(`onLaunch requestId=${launchRequest.requestId}, sessionId=${session.sessionId}`);

    // Dispatch to your skill's launch.
    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log(`onIntent requestId=${intentRequest.requestId}, sessionId=${session.sessionId}`);

    const intent = intentRequest.intent;
    const intentName = intentRequest.intent.name;

    // Dispatch to your skill's intent handlers
    if (intentName === 'categorySelect') {
        categorySelect(intent, session, callback);
    } else if (intentName === 'quizSelect') {
        quizSelect(intent, session, callback);
    } else if (intentName === 'repeatQuestion') {
        repeatQuestion(intent, session, callback);
    } else if (intentName === 'skipQuestion') {
        skipQuestion(intent, session, callback);
    } else if (intentName === 'endQuiz') {
        endQuiz(intent, session, callback);
    } else if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
        handleSessionEndRequest(callback);
    } else {
        throw new Error('Invalid intent');
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log(`onSessionEnded requestId=${sessionEndedRequest.requestId}, sessionId=${session.sessionId}`);
    // Add cleanup logic here
}


// --------------- Main handler -----------------------

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = (event, context, callback) => {
    try {
        console.log(`event.session.application.applicationId=${event.session.application.applicationId}`);

        /**
         * Uncomment this if statement and populate with your skill's application ID to
         * prevent someone else from configuring a skill that sends requests to this function.
         */
        /*
          if (event.session.application.applicationId !== 'amzn1.echo-sdk-ams.app.[unique-value-here]') {
          callback('Invalid Application ID');
        }
        */

        if (event.session.new) {
            onSessionStarted({
                requestId: event.request.requestId
            }, event.session);
        }

        if (event.request.type === 'LaunchRequest') {
            onLaunch(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'IntentRequest') {
            onIntent(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'SessionEndedRequest') {
            onSessionEnded(event.request, event.session);
            callback();
        }
    } catch (err) {
        callback(err);
    }
};
