export default {
  target: (dependencyName) => {
    if(["@types/node"].includes(dependencyName)){
      const res = "minor"
      console.log(`\n👀  ️${dependencyName} is pinned to ${res}`)
      return  res;
    }
    return 'latest'
  },
}
