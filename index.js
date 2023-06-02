//------------------------------------------------------------------------------------------------------------
//User Editable Configurable Value
//Below are four variables you can edit to easily customize the script.
const batchCount = 100;

//------------------------------------------------------------------------------------------------------------
//REQUIRED authintication credentials
//These are the credentials required to authenticate with the the Trello API. 

const apiKey = 'YOURAPIKEY'; //Enter your personal API key
const apiToken = 'YOURAPITOKEN'; //Enter your personal API token that was generated by the API key above
const enterpriseId = 'YOURENTERPRISEID'; //Enter the ID of the Trello Enterprise you want to add members to.


//------------------------------------------------------------------------------------------------------------
//Below this line is the main execution code. Edits below this line are not recommended unless you are trying to adapt the core funtionality of the script.

const headers = { 'Accept': 'application/json' };
const request = require('request');
const moment = require('moment');
const process = require('process');
const fs = require('fs');
const parse = require('csv-parse');
const timestamp = moment().format("YYYY-MM-DD-HHmmss")

let membersProcessed = 0; 
let workspacesProcessed = 0; 
let lastMemberIndex = 0; 
let lastWorkspaceIndex = 0; 

//Create member report file 
const csvHeaders_member_report = [['Full Name', 'Username', 'Email', 'Days Since Last Active', 'Last Active']];
fs.writeFileSync(`member_report_${timestamp}.csv`, '');
csvHeaders_member_report.forEach((header) => {
    fs.appendFileSync(`member_report_${timestamp}.csv`, header.join(', ') + '\r\n');
});

//Create workspace report file 
const csvHeaders_workspace_report = [['Workspace ID', 'Workaspace Name', 'Workspace Admin Username', 'Date Created']];
fs.writeFileSync(`workspace_report_${timestamp}.csv`, '');
csvHeaders_workspace_report.forEach((header) => {
    fs.appendFileSync(`workspace_report_${timestamp}.csv`, header.join(', ') + '\r\n');
});

//process next batch of Enterprise Members 
async function processNextBatchOfMembers() {
  let getManagedMembersUrl = `https://trellis.coffee/1/enterprises/${enterpriseId}/members?fields=idEnterprisesDeactivated,fullName,username,memberEmail,dateLastAccessed&associationTypes=licensed&key=${apiKey}&token=${apiToken}&count=${batchCount}`;
  if (lastMemberIndex > 0) {
    getManagedMembersUrl = getManagedMembersUrl + `&startIndex=${lastMemberIndex}`;
  };
    
  request.get({
    url: getManagedMembersUrl,
    headers: headers,
    json: true
  }, (error, response, body) => {
    const membersResponse = body;
    console.log(getManagedMembersUrl);
    console.log(body);
    console.log(`Pulled our batch of ${membersResponse.length} members. Adding them to report now...`);
    if (!Array.isArray(membersResponse) || membersResponse.length === 0) {
console.log(`No more members to process. Report is available in the member_report.csv file.`);
      return;
    }
    membersResponse.forEach((member) => {
      const daysActive = moment().diff(moment(member.dateLastAccessed), 'days');
      const rowData = [member.fullName, member.username, member.memberEmail, daysActive, member.dateLastAccessed];
fs.appendFileSync(`member_report_${timestamp}.csv`, rowData.join(', ') + '\r\n');
        console.log(`${member.fullName} has been added to the report.`);
        membersProcessed +=1;
      
  });
    lastMemberIndex += batchCount;
    setTimeout(processNextBatchOfMembers, 1000);
});
}

async function apicall(enterpriseResponse) {
  for (let i = 0; i < enterpriseResponse.idOrganizations.length; i++) {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        let idOrganization = enterpriseResponse.idOrganizations[i];
        let getWorkspaceUrl = `https://trellis.coffee/1/organizations/${idOrganization}?members=admins&&key=${apiKey}&token=${apiToken}`;

        request.get({
          url: getWorkspaceUrl,
          headers: headers,
          json: true
        }, (error, response, body) => {
          const workspaceResponse = body; 
          if (workspaceResponse.error) {
            console.log(`Error: ${workspaceResponse.message}`);
          } else {
            let workspaceTimestamp = workspaceResponse.id.toString().substring(0,8);
            let date = new Date( parseInt( workspaceTimestamp, 16 ) * 1000 );
            let adminUsernameArray = workspaceResponse.members.map(member =>member.username);
            let adminUsernameString = adminUsernameArray.join(';');
            const rowData = [workspaceResponse.id, workspaceResponse.name, adminUsernameString, date];
            fs.appendFileSync(`workspace_report_${timestamp}.csv`, rowData.join(', ') + '\r\n');
            console.log(`${workspaceResponse.id} has been added to the report.`);
            workspacesProcessed +=1;
          }
          resolve();
        });  
      }, i * 10); // each API call will be delayed by 0.1 seconds more than the previous
    });
  }
}


async function getNextOrg(enterpriseResponse){
  await apicall(enterpriseResponse);
}



//process next batch of Enterprise Workspaces
async function processNextBatchOfWorkspaces() {
  let getEntWorkspacesUrl = `https://trellis.coffee/1/enterprises/${enterpriseId}?fields=idOrganizations&&key=${apiKey}&token=${apiToken}`;

  return new Promise((resolve, reject) => {
    request.get({
      url: getEntWorkspacesUrl,
      headers: headers,
      json: true
    }, async (error, response, body) => {
      if (error) reject(error);  // If there's an error, reject the promise with the error
      else {
        const enterpriseResponse = body;
        console.log(`Pulled our batch of ${enterpriseResponse.idOrganizations.length} workspaces. Adding them to report now...`);
        if (!Array.isArray(enterpriseResponse.idOrganizations) || enterpriseResponse.idOrganizations.length === 0) {
          console.log(`No more workspaces to process. Report is available in the workspace_report.csv file.`);
          resolve(); // If there's no workspaces, resolve the promise without a value
        } else {
          organizations = enterpriseResponse.idOrganizations;

          await getNextOrg(enterpriseResponse);
          resolve(); // Resolve the promise after processing workspaces
        }
      }
    });
  });
}

// run the job once on startup
processNextBatchOfWorkspaces().then(processNextBatchOfMembers)
