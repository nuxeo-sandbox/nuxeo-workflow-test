const Nuxeo = require('nuxeo');
const fs = require('fs');
const path = require('path');
const commandLineArgs = require('command-line-args');

const optionDefinitions = [{
    name: 'credentials',
    type: String,
    defaultValue: "credentials.json"
  },
  {
    name: 'config',
    type: String,
    defaultValue: "config.json"
  },
  {
    name: 'serverUrl',
    type: String,
    defaultValue: "http://localhost:8080/nuxeo"
  }
]

const options = commandLineArgs(optionDefinitions);
console.log("Parameters: "+ prettyPrintObject(options));

const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
const credentials = JSON.parse(fs.readFileSync(options.credentials, 'utf8'));


//init nuxeo clients for each persona
const nxClients = {};
for (var role in credentials) {
  nxClients[role] = new Nuxeo({
    baseURL: options.serverUrl,
    auth: {
      method: 'basic',
      username: credentials[role].username,
      password: credentials[role].password
    }
  })
}

console.log(prettyPrintObject(config));

//create the document for the workflow
let documentDesc = {
  'entity-type': 'document',
  'name': config.document.name,
  'type': config.document.type,
  'properties': config.document.properties
};

createDocument(nxClients[config.document.creator], documentDesc)
  .then(function(doc) {
    documentDesc = doc;
    console.log("Document created: "+ prettyPrintObject(doc));
    if (config.workflow) {
      return startWorkflow(nxClients[config.workflow.initiator], documentDesc.path, config.workflow);
    } else {
      return Promise.resolve();
    }
  }).then(function(workflow) {
    return performStep(documentDesc.path, config.scenario, 0, nxClients);
  }).then(function(data) {
    console.log("Scenario Completed");
    return nxClients[config.document.creator].repository().fetch(documentDesc.path, {
      "schemas":"*"
    });
  }).then(function(doc) {
    console.log("Document after the workflow: "+ prettyPrintObject(doc));
  })
  .catch(function(error) {
    throw error;
  });


function createDocument(client, document) {
  return substituteProperties(document.properties,{
    client: client,
    substitutionFunction: setActualUsersAndUploadFiles,
    credentials: credentials
  }).then(function(batchInfo) {
    return substituteProperties(document.properties,{
      client: client,
      substitutionFunction: replaceFileDescByUploadBatchInfo,
      batchInfo: batchInfo,
      credentials: credentials
    });
  }).then(function(data) {
    console.log("Creating Document: "+ prettyPrintObject(document));
    return client.repository().create(config.document.path, document, {
      "schemas":"*"
    });
  })
}


//Perform one workflow step
function performStep(documentPath, steps, stepIndex, nxClients) {
  const step = steps[stepIndex];
  const client = nxClients[step.role];
  const actualDocumentPath = step.documentPathModifier ? documentPath + step.documentPathModifier : documentPath;
  let task;
  return client.repository().fetch(actualDocumentPath)
    .then(function(doc) {
      return doc.fetchWorkflows();
    })
    .then(function(workflows) {
      return workflows.entries[0].fetchTasks();
    })
    .then(function(tasks) {
      task = tasks.entries[0];
      return substituteProperties(step.variables,{
        client: client,
        substitutionFunction: setActualUsersAndUploadFiles,
        credentials: credentials
      });
    })
    .then(function(batchInfo) {
      return substituteProperties(step.variables,{
        client: client,
        substitutionFunction: replaceFileDescByUploadBatchInfo,
        batchInfo: batchInfo,
        credentials: credentials
      });
    })
    .then(function(data) {
      for (var variable in step.variables) {
        task.variable(variable, step.variables[variable]);
      }
      console.log("Completing Task "+prettyPrintObject({
        "name":task.name,
        "user": client._auth.username,
        "action": step.action,
        "variables":  step.variables
      }));
      return task.complete(step.action);
    }).then(function(task) {
      if (stepIndex + 1 < steps.length) {
        return performStep(documentPath, steps, stepIndex + 1, nxClients);
      } else {
        Promise.resolve();
      }
    })
    .catch(function(error) {
      throw error;
    });
}


function substituteProperties(properties, ctx) {
  ctx.promises = [];
  substituteObjectProperty(properties, ctx);
  return Promise.all(ctx.promises);
}

function substituteObjectProperty(object, ctx) {
  for (var property in object) {
    var value = object[property];
    let substitute = substituteProperty(value, ctx);
    if (substitute) {
      object[property] = substitute;
    }
  }
}

function substituteArrayProperty(array, ctx) {
  array.forEach((item, index) => {
    let substitute = substituteProperty(item, ctx);
    if (substitute) {
      array[index] = substitute;
    }
  })
}

function substituteProperty(property, ctx) {
  if (Array.isArray(property)) {
    substituteArrayProperty(property, ctx);
  }
  if (typeof property === 'object' && property !== null) {
    if (property.type) {
      return ctx.substitutionFunction(property, ctx);
    } else {
      return substituteObjectProperty(property, ctx);
    }
  }
}

function setActualUsersAndUploadFiles(value, ctx) {
  if (value.type === "blob") {
    ctx.promises.push(uploadFile(ctx.client, value));
  } else if (value.type === "user") {
    let role = value.role;
    return username = ctx.credentials[role].username;
  }
}

function replaceFileDescByUploadBatchInfo(value, ctx) {
  if (value.type === "blob") {
    var batchInfo = ctx.batchInfo[0];
    ctx.batchInfo.shift();
    return {
      'upload-batch': batchInfo.blob['upload-batch'],
      'upload-fileId': batchInfo.blob['upload-fileId']
    };
  }
}

function uploadFile(client, value) {
  const stream = fs.createReadStream(value.file);
  var blob = new Nuxeo.Blob({
    content: stream,
    name: path.basename(value.file),
    mimeType: value.mimeType,
    size: fs.statSync(value.file).size
  });
  return client.batchUpload().upload(blob);
}

function startWorkflow(client, documentPath, workflow) {
  return client.repository().fetch(documentPath)
    .then(function(doc) {
      return doc.startWorkflow(workflow.name, workflow.variables);
    });
}

function prettyPrintObject(object) {
  return JSON.stringify(object,null,2);
}
