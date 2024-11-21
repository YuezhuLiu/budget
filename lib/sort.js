// Compare object titles alphabetically (case-insensitive)
const compareByTitle = (itemA, itemB) => {
  let titleA = itemA.title.toLowerCase();
  let titleB = itemB.title.toLowerCase();

  if (titleA < titleB) {
    return -1;
  } else if (titleA > titleB) {
    return 1;
  } else {
    return 0;
  }
};

module.exports = {
  // sort a list of bills
  sortBills(budgetList) {
    return budgetList.sort(compareByTitle);
  },

  // sort a list of todos
  sortBudgetLists(budgetLists) {
    budgetLists.forEach(budgetList => {
      budgetList.title = ''.concat(budgetList.year, budgetList.month)
      if (budgetList.bills === undefined) {
        budgetList.total === 0;
      } else {
        budgetList.bills.reduce((sum, curr) => sum + (+curr.cost), 0);
      }
    });
    return budgetLists.sort(compareByTitle);
  },
};