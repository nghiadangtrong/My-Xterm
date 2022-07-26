export const to = (promise: Promise<any>) => (
  new Promise((resolve, reject) => {
    promise
      .then(data => resolve([null, data]))
      .catch(error => reject([error, null]))
  })
)
