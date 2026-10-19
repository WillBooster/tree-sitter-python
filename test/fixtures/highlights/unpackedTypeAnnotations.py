def qualified(a: typing.Tuple[*Qa], b: typing.List[typing.Tuple[*Qb]]): pass
def composite(*args: *tuple[Ta, Tb]): pass
def union(*args: *(Ua | Ub)): pass
alias: typing.Tuple[*Qc] = value
values = table[*Va]
def default(value=table[*Vb]): pass
