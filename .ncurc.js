/* eslint-disable no-undef */ 
module.exports = {
  target: (dependencyName) => {
    if(["@types/node"].includes(dependencyName)){
      const res = "minor"
      console.log(`\n👀  ️${dependencyName} is pinned to ${res}`)
      return  res;
    }
    // Keep ESLint on v9 until eslint-plugin-react / eslint-plugin-react-hooks
    // (pulled in by eslint-config-next) declare eslint v10 peer support.
    if(["eslint", "@eslint/js"].includes(dependencyName)){
      const res = "minor"
      console.log(`\n👀  ️${dependencyName} is pinned to ${res} (eslint v9)`)
      return  res;
    }
    return 'latest'
  },
}