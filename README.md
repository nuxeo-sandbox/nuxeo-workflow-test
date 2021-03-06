## Description
This repository contains a sample node scripts to simulate users completing workflow tasks in webui. It uses the nuxeo js client to make the same API calls that webui makes

## Important Note

**These features are not part of the Nuxeo Production platform.**

These solutions are provided for inspiration and we encourage customers to use them as code samples and learning resources.

This is a moving project (no API maintenance, no deprecation process, etc.) If any of these solutions are found to be useful for the Nuxeo Platform in general, they will be integrated directly into platform, not maintained here.

## How to build
Building requires the following software:
- git
- node
- npm

```
git clone https://github.com/nuxeo-sandbox/nuxeo-workflow-test
cd nuxeo-workflow-test
```

## Configure
The index.js uses two configuration files

### Credentials.json
Describes the credentials to use for each role in the workflow
```
{
  "Administrator":{
    "username":"Administrator",
    "password":"Administrator"
  }
}

```


### Config.json
Describes the process to simulate

```
{
  "baseUrl":"http://localhost:8080/nuxeo",
  "document": {
      "creator":"Administrator",
      "path": "/default-domain/workspaces/",
      "type":"File",
      "name":"MyFile",
      "properties": {
        "file:content":{
          "type": "blob",
          "file": "files/legacy-systems-risks.pdf",
          "mimeType": "application/pdf"
        }
      }
  },
  "scenario": [
    {
      "role": "Administrator",
      "action": "start_review",
      "variables": {
        "participants": [{
          "type": "user",
          "role": "Administrator"
        }, {
          "type": "user",
          "role": "Administrator"
        }],
        "validationOrReview": "simpleReview",
        "comment": "This is a test"
      }
    },{
      "role": "Administrator",
      "action": "validate",
      "variables": {
        "comment": "Cool"
      }
    }
  ]
}
```

- baseurl is the server baseUrl
- document is the document to create and that will be used by the workflow
  - creator: the profile to use to create the document
- scenario is an array that contains the step to simulate. For each step, the following variables can be set
  - role: the role to use
  - action: the button clicked by a real user in webui
  - variable: the node variables to set
    - if a variable is a blob, the variable value must be an object as described in the sample above

## Run

```
node index.js --config="<MY_CONFIG_FILE>" --credentials="<MY_CREDENTIAL_FILE>" --serverUrl="<MY_SERVER>"
```

## Examples

Run the default Serial Document Review on a OOTB Nuxeo application running at http://localhost:8080
```
node index.js --credentials="sample-credentials.json"
```

Run the default Parallel Document Review on a OOTB Nuxeo application running at http://localhost:8080
```
node index.js --config="config-parallel-document-review.json" --credentials="sample-credentials.json"
```

## Known limitations
This plugin is a work in progress.

## About Nuxeo
[Nuxeo](www.nuxeo.com), developer of the leading Content Services Platform, is reinventing enterprise content management (ECM) and digital asset management (DAM). Nuxeo is fundamentally changing how people work with data and content to realize new value from digital information. Its cloud-native platform has been deployed by large enterprises, mid-sized businesses and government agencies worldwide. Customers like Verizon, Electronic Arts, ABN Amro, and the Department of Defense have used Nuxeo's technology to transform the way they do business. Founded in 2008, the company is based in New York with offices across the United States, Europe, and Asia.

Learn more at www.nuxeo.com.
