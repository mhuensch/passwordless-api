async function onGet (request, response) {
  let connection = salesforce.connection(request)
  let objects = request.query.objects.split(',')
  
  let promises = objects.map(object => {
    return connection.query(SOQL_COUNT + object)
      .then(result => {
        result.name = object
        return result
      })
  })
  
  let results = await Promise.all(promises)
  response.send(results)
}

async function command () {
  
}

const result =
  { route: `/connecting`
  , command
  , onGet
  }
  
module.exports = result