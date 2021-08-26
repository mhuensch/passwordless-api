module.exports = (data, response) => {
  console.log(data)
  response('verified', { token: 'hahahah' })
}