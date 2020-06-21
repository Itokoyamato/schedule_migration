const axios = require('axios');
const baseURL = 'http://localhost:3000/';

const login = () => {
    return new Promise((resolve, reject) => {
        const username = 'username'; //To replace
        const password = "password";
        axios.post(`${baseURL}admin/login?__version=2`, {username, password}, {'content-type': 'application/x-www-form-urlencoded'})
        .then(data => {return resolve(data)})
        .catch(e => reject(e));
    })
}

const getInfras = (id, type) => {
    return new Promise((resolve, reject) => {
        axios.get(`${baseURL}${type}/all?__version=2`, {params: {client: id, filters: {where:{schedules: {exists: true}}}}})
        .then(data => resolve(data))
        .catch(e => {console.error(e); resolve(e)});
    })
}

const getClients = async () => {
    return new Promise((resolve, reject) => {
        axios.get(`${baseURL}client/admin/all?__version=2`, {})
        .then(data => resolve(data))
        .catch(e => reject(e))
    })
}

const checkEqualDays = (regular_schedule) => {
    const clusters = [[0]];
    for (let i = 1; i < 7; i++) {
      let index = -1;
      let added = false;
      for (cluster of clusters) {
        index++;
        if (!regular_schedule[cluster[0]].open && !regular_schedule[i].open) {
          clusters[index].push(i);
          added = true;
          break;
        }
        if (regular_schedule[i].open && regular_schedule[cluster[0]].open) {
          if (hoursAreEqual(regular_schedule[i].open_hours, regular_schedule[cluster[0]].open_hours)) {
            clusters[index].push(i);
            added = true;
            break;
          }
        }
      }
      if (!added) clusters.push([i]);
    }
    return clusters;
  }


const getClusterDays = (cluster, regular_schedule) => {
    let days = '';
    let previousDay;
    let breaks = 0;
    let startsMonday = cluster[0] === 0;
    let beforeBreak;
    let afterBreak;
    if (cluster.length === 1) return `${regular_schedule[cluster[0]].ohFormat} `;
    if (cluster.length >= 3) {
      let index = 0;
      for (day of cluster) {
        if (previousDay !== undefined && day !==  previousDay + 1) {
          if (!startsMonday) break;
          breaks++;
          beforeBreak = previousDay;
          afterBreak = day;
        }
        previousDay = day;
        index++;
        if (index === cluster.length && breaks < 2) {
          if (startsMonday && breaks === 1) return `${regular_schedule[afterBreak].ohFormat}-${regular_schedule[beforeBreak].ohFormat} `;
          return `${regular_schedule[cluster[0]].ohFormat}-${regular_schedule[cluster[cluster.length - 1]].ohFormat} `;
        }
      }
    }
    cluster.forEach((day, index) => {
      days += regular_schedule[day].ohFormat;
      if (index < cluster.length - 1) days += ','
    });
    return days + ' ';
  }


const hoursAreEqual = (h1, h2) => {
if (h1.length != h2.length) return false;
let index = 0;
for (hour of h1) {
    if (hour.start !== h2[index].start || hour.end !== h2[index].end) return false;
    index++;
}
return true;
}

const getRule = (cluster, regular_schedule) => {
    let rule = ''
    if (cluster.length === 7 && regular_schedule[0].open_hours.length === 1 && regular_schedule[0].open_hours[0].start === '24/24') return '24/7';
    rule += getClusterDays(cluster, regular_schedule);
    rule += formatTime(regular_schedule[cluster[0]])
    return rule;
}

const formatTime = (dayData) => {
    if (!dayData.open) return 'off'
    let time = ''
    let index = -1;
    for (const hours of dayData.open_hours) {
      index++;
      if (hours.start === '24/24' || (hours.start === '00:00' && hours.end === '00:00')) {
        time = '00:00-24:00 open';
        return time;
      }
      time += `${hours.start}-${hours.end}`
      if (index < dayData.open_hours.length - 1) time += ', ';
    }
    return time + ' open';
  }

const GenerateOpeningHours = (regular_schedule) => {
    return new Promise(resolve => {
      let regular = '';
      const clusters = checkEqualDays(regular_schedule);
      clusters.forEach(cluster => {
        regular += getRule(cluster, regular_schedule) + '; '
      });
      return resolve(regular);
    })
}

const saveHorairesField = (infra) => {
  if (!infra.horaires) return;
  const details = infra.horaires.length < 512 ? `${infra.details} ${infra.horaires}` : infra.details;
  axios.patch(`${baseURL}infrastructures`, {
    details,
    id: infra.id,
    horaires: null,
  }).catch(e => {});
}

const getOpeningHours = (infra) => {
    if (!infra.schedules) return new Promise((resolve, reject) => reject()); // TO remove when where works
    const regularSchedule = [{
          display: 'Lundi',
          ohFormat: 'Mo',
          open_hours: [],
          open: false,
        }, {
          display: 'Mardi',
          ohFormat: 'Tu',
          open_hours: [],
          open: false,
        }, {
          display: 'Mercredi',
          ohFormat: 'We',
          open_hours: [],
          open: false,
        }, {
          display: 'Jeudi',
          ohFormat: 'Th',
          open_hours: [],
          open: false,
        }, {
          display: 'Vendredi',
          ohFormat: 'Fr',
          open_hours: [],
          open: false,
        }, {
          display: 'Samedi',
          ohFormat: 'Sa',
          open_hours: [],
          open: false,
        }, {
          display: 'Dimanche',
          ohFormat: 'Su',
          open_hours: [],
          open: false,
        }];
        const Days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        Days.forEach((day, index) => {
            if (infra.schedules[day] && infra.schedules[day].state === true && infra.schedules[day].openAt && infra.schedules[day].closeAt) {
                regularSchedule[index].open_hours[0] = { start: infra.schedules[day].openAt, end: infra.schedules[day].closeAt };
                regularSchedule[index].open = true;
            } else regularSchedule[index].open = false;
        })
        return GenerateOpeningHours(regularSchedule);
}

const saveOpeningHours = (id, oh, type) => {
    axios.patch(`${baseURL}${type}`, {
      id,
      schedules: oh
    },  {'content-type': 'application/x-www-form-urlencoded'}).catch(e => {});
}

const migrate = async () => {
    const credentials = (await login()).data;
    axios.defaults.headers.common['Authorization'] = credentials.id;
    const clients = (await getClients()).data;
    const clientsId = clients.filter(client => client.status === 'client').map(client => client.id);
    clientsId.forEach(async id => {
        const infras = (await getInfras(id, 'infrastructures')).data.all;
        infras.forEach(infra => {
            getOpeningHours(infra).then(oh => saveOpeningHours(infra.id, oh, 'infrastructures')).catch(e => {});
            saveHorairesField(infra)
        });
        let parkings = (await getInfras(id, 'parkings')).data;
        if (!parkings) return;
        parkings = parkings.all;
        parkings.forEach(parking => getOpeningHours(parking).then(oh => saveOpeningHours(parking.id, oh, 'parkings')))
    });
}

migrate();
