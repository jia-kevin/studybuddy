/**
 * Study Buddy
 * Alexa skill that quizzes you and gives live feedback, emplying adaptive learning
 *
 * Hack the North 2017
 * Kevin Jia, Judy Liu, Kevin Zhang
 **/
'use strict';

const request = require('request');
const admin = require('firebase-admin');
const SERVICE_ACCOUNT = require('./serviceAccountKey.json');

const BASE_URL = 'https://api.quizlet.com/2.0/sets/';
const CLIENT_ID = 'uxKHy2Hg57';
const DATABASE_URL = 'https://studybuddy-b647e.firebaseio.com';

var lessons = {};
var categories = [];
var lessonsToCategories = {};

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

/**
* Copies an object
*/
function copyObject(source, destination) {
    for (var property in source) {
        destination[property] = source[property];
    }
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

/**
* Initializes everything Firebase related
*/
function initFirebase() {
    initDatabase();
    var db = admin.database();
    var count = 0;
    function checkDone() {
        count++;
        if (count == 3) {
            db.goOffline();
            console.log('Lessons: ' + '\n-------------');
            for (var key in lessons) {
                console.log(key + ': ' + lessons[key]);
            }
            console.log('Categories: ' + '\n-------------');
            console.log(categories);
            console.log('LessonsToCategories: ' + '\n-------------');
            for (var key in lessonsToCategories) {
                console.log(key + ': ' + lessonsToCategories[key]);
            }
        }
    }
    initLessons(db, checkDone);
    initCategories(db, checkDone);
    initLessonsToCategories(db, checkDone);
}

/**
* Initializes Firebase database - this must be done before other Firebase operations can be done
*/
function initDatabase() {
    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
        databaseURL: DATABASE_URL
    });
}

/**
* Initializes lessons object from Firebase database
* Takes in a Firebase database
*/
function initLessons(db, callback) {
    var output = {};
    var labels = db.ref('/labels');
    var headers = undefined;

    labels.on('value', function(snapshot) {
        headers = snapshot.val();

        if (headers !== undefined) {
            var headersArray = headers.split(', ');
            var count = 0;
            var goal = headersArray.length;

            headersArray.forEach(function (title) {
                var ref = db.ref('/data/' + title);
                ref.on('value', function(value) {
                    count++;
                    output[title] = value.val();
                    ref.off('value');
                    if (count == goal) {
                        copyObject(output, lessons);
                        callback();
                    }
                });
            });
        } else {
            labels.off('value');
        }
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
        callback();
    });
}

/**
* Initializes categories object from Firebase database
* Takes in a Firebase database
*/
function initCategories(db, callback) {
    categories = [];
    var ref = db.ref('/categories');
    var values = undefined

    ref.on('value', function(snapshot) {
        values = snapshot.val();

        if (values !== undefined) {
            categories = values.split(', ');
        } else {
            ref.off('value');
        }
        callback();
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
        callback();
    });
}

function initLessonsToCategories(db, callback) {
    lessonsToCategories = {};
    var labels = db.ref('/labels');
    var headers = undefined;

    labels.on('value', function(snapshot) {
        headers = snapshot.val();

        if (headers !== undefined) {
            var headersArray = headers.split(', ');
            var count = 0;
            var total = headersArray.length;

            headersArray.forEach(function (title) {
                var ref = db.ref('/lessonsToCategories/' + title);
                ref.on('value', function(value) {
                    lessonsToCategories[title] = value.val();
                    ref.off('value');
                    count++;
                    if (count == total) {
                        callback();
                    }
                });
            });
        } else {
            labels.off('value');
        }
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
        callback();
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
    let sessionAttributes = session.attributes;
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

function answerQuestion (intent, session, callback) {
  const questionAnswer = intent.slot.answer;
  var correctNum = session.attributes['correct'];
  var incorrectNum = session.attributes['incorrect'];

  const repromptText = null;
  var sessionAttributes = session.attributes;
  var shouldEndSession = false;
  var speechOutput = '';

  if (questionAnswer === sessionAttributes['quiz'][sessionAttributes['question']][term]){
    sessionAttributes['question'] = question++;
    sessionAttributes['correct'] = correctNum++;
    speechOutput = 'Congratulations you are correct!';
  } else {
    sessionAttributes['question'] = question++;
    sessionAttributes['incorrect'] = incorrectNum++;
    speechOutput = 'Incorrect Answer.';
  }

  callback(sessionAttributes,
    buildSpeechletResponse(intent.name, speechOutput, repromptText, shouldEndSession));

}

function repeatQuestion (intent, session, callback) {
  const repromptText = null;
  let sessionAttributes = session.attributes;
  var shouldEndSession = false;
  var speechOutput = '';

  speechOutput = sessionAttributes['quiz'][sessionAttributes['question']][definition];

  callback(sessionAttributes,
    buildSpeechletResponse(intent.name, speechOutput, repromptText, shouldEndSession));

}

function skipQuestion (intent, session, callback) {
  var question = session.attributes['question'];
  var incorrect = session.attributes['incorrect'];
  var sessionAttributes = session.attributes;
  const repromptText = null;
  var shouldEndSession = false;
  var speechOutput = '';

  sessionAttributes['question'] = question++;
  sessionAttributes['incorrect'] = incorrect++;
  speechOutput = sessionAttributes['quiz'][sessionAttributes['question']][definition];

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
        sessionAttributes['question'] = 0;
        sessionAttributes['correct'] = 0;
        sessionAttributes['incorrect'] = 0;

        var speechOutput = sessionAttributes['quiz'][sessionAttributes['question']][definition];
        var repromptText = sessionAttributes['quiz'][sessionAttributes['question']][definition];

        const shouldEndSession = false;

        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
    });
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
    } else if (intentName === 'answerQuestion'){
        answerQuestion(intent, session, callback);
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