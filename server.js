import fetch from 'node-fetch';
import _ from 'lodash';
import parse from 'csv-parse';
import fs from 'fs';
import twilio from 'twilio';

const client = new twilio('AC416411657d24d0accb813ed2dd1d7977', '3753d943ee199424a87e19d8f5ce5689');

const scoreboardApi = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?lang=en&region=us&calendartype=blacklist&limit=300&showAirings=true&dates=20200215&tz=America%2FNew_York&groups=50';
const filepath = './stats.csv'
const threeStats = {};
const gamesAlerted = [];

const processTeamKey = team => {
  const replaceMap = {
    'CSU': 'Cal State',
    "Hawai'i": 'Hawaii',
    'UC ': 'UC-',
    'UMKC': 'Missouri-Kansas City',
    'LSU': 'Louisiana',
    'McNeese': 'McNeese State',
    'UNC ': 'North Carolina-',
    'TCU': 'Texas Christian',
    'UT ': 'Tennessee-',
    'SE Missouri St': 'Southeast Missouri State',
    'SIU-': 'SIU ',
    'UNLV': 'Nevada-Las Vegas',
    'SMU': 'Southern Methodist',
    'Loyola Chicago': 'Loyola (IL)',
    'USC': 'Southern California',
    "Saint Mary's": "Saint Mary's (CA)",
  }
  const keys = _.keys(replaceMap);
  let returnTeam = team;

  _.forEach(keys, k => {
    if(team.includes(k)){
      returnTeam = returnTeam.replace(k, replaceMap[k]);
      return false;
    }
  });

  return returnTeam;
}

const getGameThrees = team => {
  const stats = _.get(team, 'statistics');
  const threesMade = _.find(stats, s => s.name === 'threePointFieldGoalsMade');
  const threesAttempted = _.find(stats, s => s.name === 'threePointFieldGoalsAttempted');

  return {
    made: parseInt(_.get(threesMade, 'displayValue', 0)),
    attempted: parseInt(_.get(threesAttempted, 'displayValue', 0))
  }
}

const getThreePercentage = team => {
  const teamKey = processTeamKey(_.get(team, 'team.location'));

  return threeStats[teamKey]
}

const round = (value, decimals) => {
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

const handleEvents = (data) => {
  const events = _.get(data, 'events');
  const brokenText = [];
  const betText = [];
  console.log(data)
  _.forEach(events, e => {
    const isHalftime = _.get(e, 'status.type.name') === 'STATUS_HALFTIME';
    const inProgress = _.get(e, 'status.type.state') === 'in';

    if(isHalftime){
      const gameId = _.get(e, 'id');
      const competitors = _.get(e, 'competitions.0.competitors');

      const home = _.find(competitors, c => c.homeAway === 'home');
      const hName = _.get(home, 'team.displayName');
      const hGameThreesObj = getGameThrees(home);
      const hThreePercentage = getThreePercentage(home);
      const hScore = parseInt(_.get(home, 'score'));
      const hSurplus = hGameThreesObj && hGameThreesObj.attempted !== 0 ? hGameThreesObj.made - hGameThreesObj.attempted * hThreePercentage : 0

      const visitor = _.find(competitors, c => c.homeAway === 'away')
      const vName = _.get(visitor, 'team.displayName');
      const vGameThreesObj = getGameThrees(visitor);
      const vThreePercentage = getThreePercentage(visitor);
      const vScore = parseInt(_.get(visitor, 'score'));
      const vSurplus = vGameThreesObj && vGameThreesObj.attempted !== 0 ? vGameThreesObj.made - vGameThreesObj.attempted * vThreePercentage : 0

      if(isNaN(hSurplus) || isNaN(vSurplus)){
        if(!gamesAlerted.includes(gameId)){
          brokenText.push(`${hName} @ ${vName} is broken.`);
          gamesAlerted.push(gameId);
        }
        return;
      }

      const surplusTeam = hSurplus < vSurplus ? 'home' : 'away';
      const surplusTeamName = surplusTeam === 'home' ? hName : vName
      //console.log(surplusTeam, surplusTeamName, hSurplus, vSurplus)
      const surplusDiff = round(Math.abs(hSurplus - vSurplus), 2);
      const scoringMargin = surplusTeam === 'home' ? hScore - vScore : vScore - hScore;

      if(scoringMargin > -5 && surplusDiff > .9){
        if(!gamesAlerted.includes(gameId)){
          betText.push(`\n${vName} - ${vScore} @ ${hName} - ${hScore}\nTeam: ${surplusTeamName}, Margin: ${scoringMargin}, Surplus: ${surplusDiff}`);
          gamesAlerted.push(gameId);
        }
      }
    }
  });

  if(brokenText.length > 0 || betText.length > 0){
    const brokenTextLine = brokenText.join('\n');
    const betTextLine = betText.join('\n');

    let message = ''
    if(betText.length > 0) message += `Bet Consideration:\n${betTextLine}`
    if(brokenText.length > 0 ) betText.length > 0 ? message += `\n\nBroken:\n${brokenTextLine}` : message += `Broken:\n${brokenTextLine}`

    console.log('Sent: \n\n' + message);

    _.forEach(['+16179420585', '+19785057542'], number => {
      client.messages.create({
        body: message,
        to: number,  // Text this number
        from: '+19783073648' // From a valid Twilio number
      })
    });
  }
}

const checkGames = () => {
  fetch(scoreboardApi)
      .then(res => res.json())
      .then(json => handleEvents(json));
}

fs.createReadStream(filepath)
    .on('error', () => {
        // handle error
    })
    .pipe(parse())
    .on('data', (row) => {
        threeStats[row[0]] = row[1];
    })

checkGames();
setInterval(checkGames, 120000);
