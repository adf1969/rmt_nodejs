/*
 * 
 * 
 * Start server:
 * node index.js
 */

var debug = true;
var fs = require('fs');
var util = require('util');
var _ = require('lodash');
var http = require('http');
var faye = require('faye');  
var async = require('async');
var axios = require('axios');
var pino = require('pino')();
var URI = require('urijs');
//var Promise = require('es6-promise').Promise;

// Initialize podiojs client
var Podio = require('podio-js').api;
var config = JSON.parse(fs.readFileSync('./config.json'));

var taskid = 83000761;
var taskid2 = 83003342;
var spaceid = 5731005;

var tasks = ["83000761", "83003342" ];
var labels = [];


// - doesn't work. Podio's docs suck
// Error handling for podiojs
//podio.on('error', function(apiRequest, response, body){
//  console.error('Podio Error:', body);
//});

// Initialize faye client
var fayeClient = new faye.Client('https://push.podio.com/faye');

// Extend faye client with signature and timestamp used for authentication
fayeClient.addExtension({
  'outgoing': function(message, callback) {
    message.ext = message.ext || {};
    message.ext = {private_pub_signature: push.channel.signature, private_pub_timestamp: push.channel.timestamp};
    callback(message);
  }
});


//----------------------------------------------------------------------------\\
//                                                                            \\
//                      FUNCTIONS                                             \\
//                                                                            \\
//                                                                            \\
                                                                            
                                                                            
//<editor-fold defaultstate="collapsed" desc="Error Handling">

function handleError (err) {
  console.log("error", err);
}


process.on('unhandledRejection', (reason, p) => {
  //console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  pino.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

//</editor-fold> Error Handling ----------------------------------------- \\

//<editor-fold defaultstate="collapsed" desc="Utility">


function isFunction(functionToCheck) {
 var getType = {};
 return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

/**
 * This function allow you to modify a JS Promise by adding some status properties.
 * Based on: http://stackoverflow.com/questions/21485545/is-there-a-way-to-tell-if-an-es6-promise-is-fulfilled-rejected-resolved
 * But modified according to the specs of promises : https://promisesaplus.com/
 */
function makeQPromise(promise) {
    // Don't modify any promise that has been already modified.
    if (promise.isResolved) return promise;

    // Set initial state
    var isPending = true;
    var isRejected = false;
    var isFulfilled = false;

    // Observe the promise, saving the fulfillment in a closure scope.
    var result = promise.then(
        function(v) {
            isFulfilled = true;
            isPending = false;
            return v; 
        }, 
        function(e) {
            isRejected = true;
            isPending = false;
            throw e; 
        }
    );

    result.isFulfilled = function() { return isFulfilled; };
    result.isPending = function() { return isPending; };
    result.isRejected = function() { return isRejected; };
    return result;
}

// sleep time expects milliseconds
// Usage:
//  sleep(500).then(() => {
//    // do something
//  }
//
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Sleep for a set duration (in milliseconds)
// Usage:
//  function sleepThenAct(){ 
//    sleepFor(2000); 
//    console.log("hello js sleep !"); 
//  }
//
function sleepFor( sleepDuration ){
    var now = new Date().getTime();
    while(new Date().getTime() < now + sleepDuration){ /* do nothing */ } 
}

// Sleep until the Promise is FULLFILLED
// Usage:
//  
function sleepUntilPromised(varPromise) {
  var qPromise = makeQPromise(varPromise);
  while (!qPromise.isFulfilled()) {
    sleepFor(500);    
  }
  return qPromise;  
}

//</editor-fold> Utility  ----------------------------------------- \\

//<editor-fold defaultstate="collapsed" desc="Podio Config">

function getConnection() {
  var connection = new Podio({
    authType: 'client',
    clientId: config.clientId,
    clientSecret: config.clientSecret  
    }, {
      apiURL: config.apiURL,
      enablePushService: true  
  });  
  return connection;  
}

//</editor-fold> Podio Config  ----------------------------------------- \\

//<editor-fold defaultstate="collapsed" desc="Podio Auth">



function authUser (connection, userInfo, callback) {
  connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
    connection.request('get','/user/status')
    .then(function(responseData) {
      callback(null, responseData);
    }).catch(function(err) {
      callback(err);
    });
  })
}

function authUserIsAuth(connection, userInfo, callback) {
  connection.isAuthenticated().then(function() {
    callback(null, responseData);
  }).catch(function(err) {
    connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
      callback(null);
    });
  });  
}



//// AUTH TESTING \\\\
//
// BROKEN \\
function authUserSync (connection, userInfo) {
  async.series([
    async function(callback) {
      await new Promise(function(resolve, reject) {        
        connection.authenticateWithCredentials(userInfo.username, userInfo.password);
        resolve();
      });      
      //callback(null);
    },
    async function(callback) {
      let respData = await connection.request('get','/user/status');
      //callback(null, respData);
    }],
    function(err, results) {
      return results[1];
    }); // async.series[]
}


async function authUserSync2 (connection, userInfo) {
  let ret = await new Promise(async function(resolve, reject) { 
    await connection.authenticateWithCredentials(userInfo.username, userInfo.password);
    resolve();
  });
  var retVal = connection.isAuthenticated();
  return retVal;
}

async function authUserSync3 (connection, userInfo) {
  const authenticateWithCredentials = util.promisify(connection.authenticateWithCredentials);
  await authenticateWithCredentials(userInfo.username, userInfo.password)
    .then(resp => {return resp;}
    ).catch(handleError);
}


if (false) {
  var conn = getConnection();
  var ud = authUserSync3(conn, config.rmticket_user);
  //var ud = makeQPromise(authUserSync3(conn, config.rmticket_user));
  //console.log("ud.isFullfilled: ", ud.isFulfilled());
  //sleepFor(5000);
  //console.log("ud.isFullfilled: ", ud.isFulfilled());
  console.log("ud: ", ud);
}


//</editor-fold> Podio Auth  ----------------------------------------- \\

//<editor-fold defaultstate="collapsed" desc="Podio Tasks">


function getUniqueTaskIds(tasks) {
  var taskIds = [];
  for (let task of tasks) {
    if (!taskIds.includes(task.task_id)) {
      taskIds.push(task.task_id);
    }
  }
  return taskIds;
}

function getTask(connection, taskId) {
  console.log("Process Task: ", taskId);
  connection.request('get', '/task/' + taskid, {})
    .then(function(responseData){
      console.log("Task responseData", responseData);
      return responseData;
    }).catch(handleError);
}

/**
 * 
 * @param {type} completed
 * @param {type} page
 * @param {type} pageSize
 * @param {type} app_id
 * @return {undefined}
 * 
 * Format for getting a task is:
 * Get all incomplete tasks in a specific App
 * /task/?app=#&completed=0&offset=0&sort_by=rank&sort_desc=false
 * 
 * Get all incomplete tasks with a specific label (you have to KNOW the Label ID first!)
 * /task/?app=19864431&completed=0&grouping=label&label=2481588&limit=10&offset=0&sort_by=rank&sort_desc=false
 */
function getAllTasks(completed, page, pageSize, app_id) {
  if (app_id == null) {
    app_id = config.rmticket_app.id;
  }
  var connection = getConnection();
  authUser(connection, config.rmticket_user, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/')
        .addQuery('app', app_id)
        .addQuery('completed', completed);

      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Tasks: ", responseData);        
          return responseData;
        });
    }); // authUser()
}


///// TASK TESTING \\\\\
//getAllTasks(0, 1, 100);

if (false) {
async.series([
  function(callback) {
    var l1 = getUserLabels(null, callback);
    console.log("Labels 1:", l1);
  },
  function(callback) {
    var l2 = getUserLabels(null, callback);        
    console.log("Labels 2:", l2);
  }
  ],
  function(err, results) {
    console.log("2nd Labels 1:", results[0]);
    console.log("2nd Labels 2:", results[1]);
  });
  
}

//</editor-fold> Podio Tasks  ----------------------------------------- \\


//<editor-fold defaultstate="collapsed" desc="Task Labels">

// Given an array of labels userLabels, get the LabelID of labelText
function getLabelId(userLabels, labelText) {
  for (let label of userLabels) {
    if (label.text == labelText) {
      return label.label_id;
    }
  }
  return null;
}

function getUserLabelsP(connection, userInfo) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (connection == null) {
    var connection = getConnection();  
  }
  console.log("getUserLabelsP: ", userInfo);

  var url = new URI('/task/label/');      
  connection.request('get', url.toString())
    .then(function(responseData) {
      return new Promise(function (resolve, reject) {
        resolve(responseData);
      });
    }).catch(handleError);

};

function getUserLabels2(connection, userInfo) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (connection == null) {
    var connection = getConnection();  
  }
  console.log("getUserLabels2: ", userInfo);  
  connection.isAuthenticated()
    .then(function() {
      var url = new URI('/task/label/');      
      connection.request('get', url.toString())
        .then(function(responseData) {
          return responseData;
        }).catch(handleError);
      }).catch(handleError);      
}

/**
 * 
 * @return {undefined}
 * 
 * Gets all the labels of the user/pass passed in userInfo
 */
function getUserLabels(userInfo, callback) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (userInfo.username in labels) {
    responseData = labels[userInfo.username];
    if (isFunction(callback)) { 
      callback(null, responseData); 
    } else {
      return responseData;
    }
  }
  
  var connection = getConnection();
  authUser(connection, userInfo, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/label/');
      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Labels: ", responseData);        
          labels[userInfo.username] = responseData;
          if (isFunction(callback)) { 
            callback(null, responseData); 
          } else {
            return responseData;
          }
        });
    }); // authUser()
}

function getUserLabelsSync(userInfo) {
  if (userInfo == null) {
    userInfo = config.rmticket_user;
  }
  if (userInfo.username in labels) {
    responseData = labels[userInfo.username];
    return responseData;
  }  
  var connection = getConnection();
  authUser(connection, userInfo, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/label/');
      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Labels: ", responseData);        
          labels[userInfo.username] = responseData;
          return responseData;
        });
    }); // authUser()
}

//// LABEL TESTING \\\\
// NOTE - because of how getUserLabels works, it will AUTO-RETURN as soon as it runs
// unless you pass (null, callback) - then it will run callback once it returns
// I should probably make this a Promise? Then I can add a .then() to it.
//
if (false) {
var l1 = getUserLabels();
console.log("Labels 1:", l1);
}

//testGetUsersLabelsSync();
function testGetUserLabelsSync() {
  var connection = getConnection();
  authUser(connection, config.rmticket_user, 
    function(err, results) {
      if (err) { handleError(err); }
      var userData = results;    
      console.log("rmticket_user data", userData);
      var url = new URI('/task/')
        .addQuery('app', app_id)
        .addQuery('completed', completed);

      connection.request('get', url.toString())
        .then(function(responseData) {
          console.log("Tasks: ", responseData);        
          return responseData;
        });
    }); // authUser()  
}

//var l1 = getUserLabels();
//var l2 = getUserLabels();


//</editor-fold> Task Labels  ----------------------------------------- \\


//<editor-fold defaultstate="collapsed" desc="Podio Push Subscriptions">



function addSubscription(connection, taskId) {
  console.log("Process Task: ", taskId);
  var task = getTask(connection, taskId);    
  connection.push(task.push).subscribe(onNotificationReceived)
    .then(function(responseData) {
      console.log('Added subscription to taskid ', taskid);
    }).catch(handleError);
}

function addSubscriptionToTask(connection, taskId, callback) {
  console.log("Process Task: ", taskId);
  connection.request('get', '/task/' + taskId, {})
    .then(function(responseData){
      //console.log("Task responseData", responseData);
      console.log("responseData.push", responseData.push);
      connection.push(responseData.push).subscribe(onNotificationReceived)
        .then(function() {
          console.log('Added subscription to taskid ', taskId);          
          callback();
        }).catch(handleError);
    }).catch(handleError);
}

function authAndAddSubscriptionToTask(taskId, callback) {
  var connection = getConnection();  
  console.log("Auth and Add Subscription to Task: ", taskId);
  userInfo = config.rmticket_user;
  
  // this 1 line
  authUserIsAuth(connection, userInfo, () => addSubscription(taskId, callback));
  // replaces all these lines
//  connection.isAuthenticated().then(function() {
//    addSubscriptions(taskId, callback);
//  }).catch(function(err) {
//    connection.authenticateWithCredentials(userInfo.username, userInfo.password, function() {
//      addSubscriptions(taskId, callback);
//    });
//  });
  
  function addSubscription(taskId, callback) {
    console.log("addSubscription: ", taskId)
    connection.request('get', '/task/' + taskId, {})
      .then(function(responseData){
        //console.log("Task responseData", responseData);
        console.log("responseData.push", responseData.push);
        connection.push(responseData.push).subscribe(onNotificationReceived)
          .then(function() {
            console.log('Added subscription to taskid ', taskId);
            callback();
          }).catch(handleError);
      }).catch(handleError);
  }; 
} // authAndAddSubscriptionToTask


//testMultiTasks4();
function testMultiTasks4() {
  console.log("Starting: testMultiTasks4");

  // Process all tasks      
  async.eachSeries(tasks, function(taskId, callback) {
    console.log("Process ", taskId);
    authAndAddSubscriptionToTask(taskId, callback);
    //callback();
  }, function(err) {
    if (err) {
      console.log("Error processing tasks", err);
    } else {
      console.log("All tasks processed successfully.");
    }
  }); // async.eachSeries()
  
}



//</editor-fold> Podio Push Subscriptions  ----------------------------------------- \\





//<editor-fold defaultstate="collapsed" desc="Event Processing">

onRunSetup();

/**
 * Routine called to setup the various subscriptions
 * 
 * @return {undefined}
 */
function onRunSetup() {  
  userInfo = config.rmticket_user;
  var connection = getConnection();
  var options = {
    connection: connection,
    labelFilter: 'RF2',
    appId: config.rmticket_app.id,
    completed: 0
    };
  authUser(connection, userInfo, 
    function(err, results) {
      if (err) { handleError(err); }  
      // GET LABELS
      var url = new URI('/task/label/');      
      connection.request('get', url.toString())     
      .then(function(responseData) {
        // PROCESS LABELS
        options.userLabels = responseData;        
        console.log("1 options:", options);
        return options;
      })
      .then(function(options) {
        console.log("2 options:", options);
        var userLabels = options.userLabels;
        // Get the label we care about
        var labelFilterId = getLabelId(userLabels, options.labelFilter);
        console.log("2 labelFilterId", labelFilterId);
        // /task/?app=19864431&completed=0&grouping=label&label=2481588&limit=10&offset=0&sort_by=rank&sort_desc=false
        var app_id = config.rmticket_app.id;
        var url = new URI('/task/')
          .addQuery('app', options.appId)
          .addQuery('completed', options.completed)
          .addQuery('limit', 100)
          .addQuery('offset', 0);
        if (labelFilterId != null) {
          url.addQuery('grouping', 'label')
            .addQuery('label', labelFilterId);
        }          
        // GET TASKS
        connection.request('get', url.toString())
        .then(function(responseData) {
          // PROCESS TASKS
          options.tasks = responseData;
          console.log("3 options:", options);
          var taskIds = getUniqueTaskIds(options.tasks);
          console.log("3 taskIds", taskIds);

          // Add the Subscriptions
          // Process all tasks      
          async.eachSeries(taskIds, function(taskId, callback) {
            console.log("3 Process TaskId ", taskId);
            authAndAddSubscriptionToTask(taskId, callback);
            //callback();
          }, function(err) {
            if (err) {
              console.log("3 Error processing tasks", err);
            } else {
              console.log("3 All tasks processed successfully.");
            }
          }); // async.eachSeries()       
        });
      }).catch(handleError);
  });
}


//<editor-fold defaultstate="collapsed" desc="Notification Events">

function onNotificationReceived (notification) {  
  var eType = notification.data.event;
  var data = notification.data;
  switch (eType) {
    case 'comment_create':
      break;
    
    case 'viewing':
    case 'typing':
      // Skip these...
      break;
      
    case 'stream_create': // task
      break;
      
    case 'stream_event': // space
      //  Called when I added a comment to a task that was in a space I was monitoring      
      //  Data you get:
      //   notification.created_by.type = "user"
      //   notification.created_by.id = user_id (user id of the creating user)
      //   data.data_ref.type = "comment"
      //   data.data_ref.id = comment_id      
      //   data.ref.type = "task"
      //   data.ref.id = task_id
      //   data.data.type = "comment"
      //  Called when I update a task      
      //  Data you get
      //   data.ref.type = "task"
      //   data.ref.id = task_id  
      //   data.event_id = event_id      
      //   data.type = "update"
      //   data.data_ref.type = "task_action"   
      //   data.data_ref.id = task_id      
      //   notification.created_by.type = "user"
      //   notification.created_by.id = user_id (user id of the creating user)
      //   notification.created_via: 1 (not sure what this means)      
      //    

      var dataJson = JSON.stringify(data);
      var dataRefType = data.ref.type;
      var dataRefId = data.ref.id;      
      var dataType = data.data.type;
      pino.debug('stream_event. notification.data', notification.data);
      break;
    
    case 'update': // task
      break;
      
    default:
      pino.trace('Other Notification. notification.data', notification.data);
      break;
      
  }
}

//</editor-fold> Events  ----------------------------------------- \\

//</editor-fold> Event Processing  ----------------------------------------- \\





console.log("rmt_nodejs finished loading.");