import { useMemo, useState } from 'react'
import { Avatar, Button, Modal, RadioGroup, TextInput } from '@piposaude/design-system'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { analystsOf, childGroupsOf } from '@/lib/pipodesk/permissions'
import { candidatesFor, elsewhereOf, joinTargets } from '@/lib/pipodesk/team'
import { initialsOf } from '@/lib/pipodesk/format'
import type { Group, MemberRole } from '@/lib/pipodesk/structure'
import constants from '@/constants/pages/pipodesk/team'
import styles from './AddPersonModal.module.css'

const copy = constants.addPerson

export interface AddPersonModalProps {
  group: Group
  isRoot: boolean
  onClose: () => void
}

/**
 * Adding a person, one step at a time: Role → Pod (at the root only) → Person.
 * Each step narrows the next — the role decides whether there is a pod to
 * pick, the pod decides who is still missing — so an invalid combination is
 * not something the form can hold.
 */
export function AddPersonModal({ group, isRoot, onClose }: AddPersonModalProps) {
  const { structure, people, groupWrites } = useDesk()
  const [role, setRole] = useState<MemberRole | null>(null)
  const [podId, setPodId] = useState<string | null>(isRoot ? null : group.id)
  const [userId, setUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const pods = childGroupsOf(structure, group.id)
  /* An operation's analyst goes into a pod; its coordination is the root's. */
  const needsPod = isRoot && role === 'member'
  const target = needsPod ? podId : group.id
  const targetGroup = structure.groups.find((candidate) => candidate.id === target)

  const candidates = useMemo(
    () => (target === null ? [] : candidatesFor(people, structure, target, query)),
    [people, structure, target, query],
  )
  const elsewhere = userId === null ? [] : elsewhereOf(structure, userId, group.id)
  const person = people.find((candidate) => candidate.id === userId)
  const ready = role !== null && userId !== null && target !== null

  const include = () => {
    if (!ready) return
    groupWrites.addMembers(
      joinTargets(structure, target, role, userId).map((membership) => ({
        ...membership,
        userId,
      })),
    )
    onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={isRoot ? copy.titleRoot : copy.title(group.name)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button variant="primary" disabled={!ready} onClick={include}>
            {copy.submit}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <section className={styles.step}>
          <h3>{copy.role}</h3>
          <RadioGroup
            value={role ?? ''}
            onChange={(value) => {
              setRole(value as MemberRole)
              // Another role reopens the rest: a pod picked for an analyst is
              // not the coordination's, and neither is the person.
              setUserId(null)
              if (isRoot) setPodId(null)
            }}
            options={[
              {
                value: 'member',
                label: copy.analyst,
                caption: isRoot ? copy.analystCaptionRoot : copy.analystCaption,
              },
              {
                value: 'admin',
                label: isRoot ? copy.coordinationRoot : copy.coordination(group.name),
                caption: isRoot ? copy.coordinationCaptionRoot : copy.coordinationCaption,
              },
            ]}
          />
        </section>

        {needsPod && (
          <section className={styles.step}>
            <h3>{copy.pod}</h3>
            <RadioGroup
              value={podId ?? ''}
              onChange={(value) => {
                setPodId(value)
                setUserId(null)
              }}
              options={pods.map((pod) => ({
                value: pod.id,
                label: pod.name,
                // Load of each pod, so people are not spread without seeing it.
                caption: copy.podCaption(
                  pod.companyIds.length,
                  analystsOf(structure, pod.id).length,
                ),
              }))}
            />
          </section>
        )}

        {role !== null && target !== null && (
          <section className={styles.step}>
            <h3>{copy.person}</h3>
            <label className={styles.srOnly} htmlFor="add-person-search">
              {copy.search}
            </label>
            <TextInput
              id="add-person-search"
              value={query}
              placeholder={copy.search}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className={styles.people}>
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={styles.option}
                    aria-pressed={userId === candidate.id}
                    onClick={() => setUserId(candidate.id)}
                  >
                    {/* The initials would join the button's name: "AJ Adriana Junqueira". */}
                    <span aria-hidden="true">
                      <Avatar size="sm" text={initialsOf(candidate.name)} alt="" />
                    </span>
                    {candidate.name}
                  </button>
                </li>
              ))}
            </ul>
            {candidates.length === 0 && targetGroup && (
              <p className={styles.hint}>{copy.nobodyLeft(targetGroup.name)}</p>
            )}
            {person && elsewhere.length > 0 && (
              <p className={styles.hint}>{copy.elsewhere(person.name, elsewhere)}</p>
            )}
            {person && role === 'member' && <p className={styles.hint}>{copy.emptyPortfolio}</p>}
          </section>
        )}
      </div>
    </Modal>
  )
}
